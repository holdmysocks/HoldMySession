import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { LinkSetting } from '@/features/settings/settings.types'

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
  /** Node: the state of the link to its master. */
  sync: { lastPushAt: string | null; lastAttemptAt: string | null; lastError: string | null; masterName: string | null }
}

async function readState(): Promise<LinkState> {
  const { readSettingsFile } = await import('@/lib/settings-file')
  const { openHistoryDb } = await import('@/lib/history/history-db')
  const { listMachines, selfMachineId, hasOtherMachines } = await import('@/lib/link/machines')
  const { isLinkedNode } = await import('@/lib/link/shared')
  const { linkStatus } = await import('@/lib/link/node-sync')
  const { isOnline, touchActivity } = await import('@/lib/link/channel')
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
  .handler(async ({ data }) => updateLink((link) => ({ ...link, listen: data.listen })))

export interface ConnectResult {
  ok: boolean
  message: string
  masterName?: string
}

/** Checks the master's address and token, and if they work, saves them and sends this machine's history. */
export const connectToMaster = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ url: z.string().max(500), token: z.string().max(200) }).parse(input))
  .handler(async ({ data }): Promise<ConnectResult> => {
    const { normalizeMasterUrl, pushToMaster } = await import('@/lib/link/node-sync')
    const { readSettingsFile } = await import('@/lib/settings-file')
    const { openHistoryDb, LATEST_SCHEMA_VERSION } = await import('@/lib/history/history-db')
    const { readVersionFromPackageJson } = await import('@/lib/app-version')

    const base = normalizeMasterUrl(data.url)
    if (!base) return { ok: false, message: 'That is not a valid address. Use something like http://192.168.1.20:3000.' }
    if (!data.token.trim()) return { ok: false, message: 'Enter the master\'s token.' }

    let reply: Response
    try {
      reply = await fetch(`${base}/api/link/ping`, {
        headers: { Authorization: `Bearer ${data.token.trim()}` },
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      return { ok: false, message: `Could not reach ${base}. Check the address, that the master is running with "Listen on the network" on, and that both machines are on the same network or tailnet.` }
    }
    const body = (await reply.json().catch(() => ({}))) as { message?: string; name?: string; schemaVersion?: number }
    if (!reply.ok) return { ok: false, message: body.message ?? `The master answered ${reply.status}.` }
    if (body.schemaVersion !== LATEST_SCHEMA_VERSION) {
      return { ok: false, message: 'The master runs a different version of the app. Update both to the same version.' }
    }

    await updateLink((link) => ({ ...link, role: 'node', masterUrl: base, masterToken: data.token.trim() }))
    const db = openHistoryDb()
    try {
      await pushToMaster(db, readSettingsFile(), readVersionFromPackageJson())
    } finally {
      db.close()
    }
    return { ok: true, message: `Linked to ${body.name ?? 'the master'}.`, masterName: body.name }
  })

export const disconnectFromMaster = createServerFn({ method: 'POST' }).handler(async () =>
  updateLink((link) => ({ ...link, masterUrl: '', masterToken: '' })),
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
