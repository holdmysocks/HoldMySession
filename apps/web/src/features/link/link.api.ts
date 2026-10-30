import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { LinkSetting } from '@/features/settings/settings.types'
import type { MachineAddress } from '@/lib/link/addresses'
import type { FirewallState } from '@/lib/link/firewall'

export interface MachineSummary {
  machineId: string
  name: string
  isSelf: boolean
  appVersion: string | null
  lastSeenAt: string
  sessions: number
  /** Connected to this master right now, so its live data can be asked for. */
  online: boolean
}

export interface LinkState {
  link: LinkSetting
  /** This install takes prices and the plan from a master, so those editors are read-only. */
  linkedNode: boolean
  /** More than one machine's data is here, so pages show a machine filter. */
  showMachineFilter: boolean
  selfMachineId: string
  machines: MachineSummary[]
  /** Master: how nodes reach this machine. */
  network: {
    port: number
    addresses: MachineAddress[]
    /** One string a node can paste to join: every address and the token. Null until this machine is a master. */
    pairingCode: string | null
    /** The server is listening on the network right now. */
    listeningOnNetwork: boolean
    /** The Listen on the network choice differs from what the server is doing, so it must be restarted. */
    needsRestart: boolean
    /** The desktop app can restart itself from here. Otherwise the person restarts it. */
    canRestart: boolean
    firewall: FirewallState
  }
  /** Node: the state of the link to its master. */
  sync: { lastPushAt: string | null; lastAttemptAt: string | null; lastError: string | null; masterName: string | null }
}

interface NetworkDeps {
  machineAddresses: typeof import('@/lib/link/addresses').machineAddresses
  makePairingCode: typeof import('@/lib/link/addresses').makePairingCode
  firewallState: typeof import('@/lib/link/firewall').firewallState
  canRestart: boolean
}

function networkState(link: LinkSetting, deps: NetworkDeps): LinkState['network'] {
  const port = Number(process.env.HOLDMYSESSION_PORT_IN_USE) || 3000
  const listeningOnNetwork = ['0.0.0.0', '::'].includes(process.env.HOLDMYSESSION_LISTEN_HOST ?? '')
  const addresses = deps.machineAddresses(port)
  return {
    port,
    addresses,
    pairingCode: link.role === 'master' && link.nodeToken ? deps.makePairingCode(addresses.map((a) => a.url), link.nodeToken) : null,
    listeningOnNetwork,
    needsRestart: link.role === 'master' && (link.listen === 'network') !== listeningOnNetwork,
    canRestart: deps.canRestart,
    firewall: deps.firewallState(),
  }
}

async function readState(): Promise<LinkState> {
  const { readSettingsFile } = await import('@/lib/settings-file')
  const { openHistoryDb } = await import('@/lib/history/history-db')
  const { listMachines, selfMachineId, hasOtherMachines } = await import('@/lib/link/machines')
  const { isLinkedNode } = await import('@/lib/link/shared')
  const { linkStatus } = await import('@/lib/link/node-sync')
  const { isOnline, touchActivity } = await import('@/lib/link/channel')
  const { machineAddresses, makePairingCode } = await import('@/lib/link/addresses')
  const { firewallState } = await import('@/lib/link/firewall')
  const { desktopBridge } = await import('@/lib/desktop-bridge')
  const settings = readSettingsFile()
  // A page being open is what keeps a master asking its nodes for fresh stats.
  if (settings.link.role === 'master') touchActivity()
  const db = openHistoryDb()
  try {
    return {
      link: settings.link,
      linkedNode: isLinkedNode(settings),
      // Only a master shows other machines. A node holds its own data only.
      showMachineFilter: settings.link.role === 'master' && hasOtherMachines(db),
      selfMachineId: selfMachineId(db),
      machines: listMachines(db).map((m) => ({
        machineId: m.machineId, name: m.name, isSelf: m.isSelf, appVersion: m.appVersion, lastSeenAt: m.lastSeenAt, sessions: m.sessions,
        online: m.isSelf || isOnline(m.machineId),
      })),
      network: networkState(settings.link, { machineAddresses, makePairingCode, firewallState, canRestart: desktopBridge() !== null }),
      sync: linkStatus(db),
    }
  } finally {
    db.close()
  }
}

export const getLinkState = createServerFn({ method: 'GET' }).handler(readState)

async function updateLink(change: (link: LinkSetting) => LinkSetting): Promise<LinkState> {
  const { readSettingsFile, writeSettingsFile } = await import('@/lib/settings-file')
  const settings = readSettingsFile()
  writeSettingsFile({ ...settings, link: change(settings.link) })
  return readState()
}

export const setLinkRole = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ role: z.enum(['node', 'master']) }).parse(input))
  .handler(async ({ data }) => {
    const { generateToken } = await import('@/lib/link/auth')
    return updateLink((link) => ({
      ...link,
      role: data.role,
      // A master needs a token from the first moment it is one.
      nodeToken: data.role === 'master' && link.nodeToken === '' ? generateToken() : link.nodeToken,
    }))
  })

export const regenerateNodeToken = createServerFn({ method: 'POST' }).handler(async () => {
  const { generateToken } = await import('@/lib/link/auth')
  return updateLink((link) => ({ ...link, nodeToken: generateToken() }))
})

export const setListen = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ listen: z.enum(['local', 'network']) }).parse(input))
  .handler(async ({ data }) => {
    const state = await updateLink((link) => ({ ...link, listen: data.listen }))
    // Turning the network on is when the firewall permission is needed, so ask for it now.
    if (data.listen === 'network') {
      const { firewallState, requestFirewallRule, markDeclined } = await import('@/lib/link/firewall')
      if (firewallState() === 'missing') {
        markDeclined(false)
        requestFirewallRule(Number(process.env.HOLDMYSESSION_PORT_IN_USE) || 3000)
      }
    }
    return state
  })

/** Asks Windows to let this machine be reached from the local network and the tailnet. Shows Windows' own permission prompt. */
export const allowFirewall = createServerFn({ method: 'POST' }).handler(async (): Promise<LinkState> => {
  const { requestFirewallRule, markDeclined } = await import('@/lib/link/firewall')
  markDeclined(false)
  requestFirewallRule(Number(process.env.HOLDMYSESSION_PORT_IN_USE) || 3000)
  return readState()
})

/** Restarts the desktop app, so a changed Listen on the network choice takes effect. */
export const restartApp = createServerFn({ method: 'POST' }).handler(async (): Promise<boolean> => {
  const { desktopBridge } = await import('@/lib/desktop-bridge')
  const bridge = desktopBridge()
  if (!bridge) return false
  // Answer first, then restart, so the page gets its reply.
  setTimeout(() => bridge.restart(), 300)
  return true
})

export interface ConnectResult {
  ok: boolean
  message: string
  masterName?: string
}

/**
 * Joins a master. Give a pairing code (every address of the master and its token, copied from the master's
 * Settings), or one address and the token. Every address is tried at the same time and the first of them
 * that answers is used, with the rest kept, so the same node works on the local network and over a tailnet.
 */
export const connectToMaster = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ code: z.string().max(4000).optional(), url: z.string().max(500).optional(), token: z.string().max(200).optional() }).parse(input))
  .handler(async ({ data }): Promise<ConnectResult> => {
    const { normalizeMasterUrl, pushToMaster, noteGoodAddress } = await import('@/lib/link/node-sync')
    const { parsePairingCode } = await import('@/lib/link/addresses')
    const { explainConnectionError } = await import('@/lib/link/explain')
    const { readSettingsFile } = await import('@/lib/settings-file')
    const { openHistoryDb, LATEST_SCHEMA_VERSION } = await import('@/lib/history/history-db')
    const { readVersionFromPackageJson } = await import('@/lib/app-version')

    let urls: string[]
    let token: string
    if (data.code?.trim()) {
      const parsed = parsePairingCode(data.code)
      if (!parsed) return { ok: false, message: 'That pairing code is not valid. Copy it again from the master\'s Settings.' }
      urls = parsed.urls
      token = parsed.token
    } else {
      token = (data.token ?? '').trim()
      urls = data.url?.trim() ? [data.url] : []
    }
    const bases = [...new Set(urls.map((u) => normalizeMasterUrl(u)).filter((u): u is string => u !== null))]
    if (bases.length === 0) return { ok: false, message: 'That is not a valid address. Use something like http://192.168.1.20:3000, or paste the pairing code.' }
    if (!token) return { ok: false, message: 'Enter the master\'s token, or paste its pairing code.' }

    type Ping = { base: string; reply?: Response; body?: { message?: string; name?: string; schemaVersion?: number }; error?: unknown }
    const pings: Ping[] = await Promise.all(
      bases.map(async (base): Promise<Ping> => {
        try {
          const reply = await fetch(`${base}/api/link/ping`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) })
          return { base, reply, body: (await reply.json().catch(() => ({}))) as Ping['body'] }
        } catch (error) {
          return { base, error }
        }
      }),
    )
    const good = pings.find((p) => p.reply?.ok)
    if (!good) {
      const answered = pings.find((p) => p.reply)
      if (answered) return { ok: false, message: answered.body?.message ?? `The master answered ${answered.reply?.status}.` }
      return { ok: false, message: pings.map((p) => explainConnectionError(p.error, p.base)).join(' ') }
    }
    if (good.body?.schemaVersion !== LATEST_SCHEMA_VERSION) {
      return { ok: false, message: 'The master runs a different version of the app. Update both to the same version.' }
    }

    noteGoodAddress(good.base)
    await updateLink((link) => ({ ...link, role: 'node', masterUrl: good.base, masterUrls: bases, masterToken: token }))
    const db = openHistoryDb()
    try {
      await pushToMaster(db, readSettingsFile(), readVersionFromPackageJson())
    } finally {
      db.close()
    }
    return { ok: true, message: `Linked to ${good.body?.name ?? 'the master'}.`, masterName: good.body?.name }
  })

export const disconnectFromMaster = createServerFn({ method: 'POST' }).handler(async () =>
  updateLink((link) => ({ ...link, masterUrl: '', masterUrls: [], masterToken: '' })),
)

/** Sends what changed to the master now, without scanning. */
export const syncNow = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ everything: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const { readSettingsFile } = await import('@/lib/settings-file')
    const { openHistoryDb } = await import('@/lib/history/history-db')
    const { pushToMaster, resendEverything } = await import('@/lib/link/node-sync')
    const { readVersionFromPackageJson } = await import('@/lib/app-version')
    const db = openHistoryDb()
    try {
      if (data.everything) resendEverything(db)
      return await pushToMaster(db, readSettingsFile(), readVersionFromPackageJson())
    } finally {
      db.close()
    }
  })

export const renameMachineName = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ machineId: z.string().min(1), name: z.string().max(200) }).parse(input))
  .handler(async ({ data }): Promise<LinkState> => {
    const { readSettingsFile } = await import('@/lib/settings-file')
    const { openHistoryDb } = await import('@/lib/history/history-db')
    const { renameMachine, selfMachineId } = await import('@/lib/link/machines')
    const settings = readSettingsFile()
    const db = openHistoryDb()
    try {
      // A node may only name itself. A master names any machine.
      if (settings.link.role !== 'master' && data.machineId !== selfMachineId(db)) {
        throw new Error('A node can only change its own name.')
      }
      renameMachine(db, data.machineId, data.name)
    } finally {
      db.close()
    }
    return readState()
  })

export const removeLinkedMachine = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ machineId: z.string().min(1), deleteData: z.boolean() }).parse(input))
  .handler(async ({ data }): Promise<LinkState> => {
    const { readSettingsFile } = await import('@/lib/settings-file')
    const { openHistoryDb } = await import('@/lib/history/history-db')
    const { removeMachine } = await import('@/lib/link/machines')
    if (readSettingsFile().link.role !== 'master') throw new Error('Only a master can remove a machine.')
    const db = openHistoryDb()
    try {
      removeMachine(db, data.machineId, data.deleteData)
    } finally {
      db.close()
    }
    return readState()
  })
