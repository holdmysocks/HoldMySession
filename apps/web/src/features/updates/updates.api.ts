import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { UpdateInfo } from '@/lib/updates/update-check'
import type { UpdateStatus } from '@/lib/desktop-bridge'

export type { UpdateInfo, UpdateStatus }

export type UpdateState = UpdateInfo & {
  /** The settings allow looking for updates by themselves. */
  checking: boolean
  /** The app can download and install the update itself. False in a browser or command-line run. */
  canInstall: boolean
  /** Why it cannot, when there is a reason worth showing. */
  cannotInstallReason: string | null
  /** What the download is doing, in the desktop app. */
  update: UpdateStatus | null
  autoUpdate: boolean
}

async function currentState(force: boolean): Promise<UpdateState> {
  const { readVersionFromPackageJson } = await import('@/lib/app-version')
  const { readSettingsFile } = await import('@/lib/settings-file')
  const { checkForUpdate, RELEASES_URL } = await import('@/lib/updates/update-check')
  const { desktopBridge } = await import('@/lib/desktop-bridge')
  const current = readVersionFromPackageJson()
  const settings = readSettingsFile()
  const bridge = desktopBridge()
  const info: UpdateInfo =
    settings.checkForUpdates || force
      ? await checkForUpdate(current, undefined, undefined, force)
      : { current, latest: null, available: false, url: RELEASES_URL, download: null }
  const supported = bridge ? bridge.updates.supported() : { ok: false as const, reason: 'Updating itself is only available in the desktop app.' }
  return {
    ...info,
    checking: settings.checkForUpdates,
    canInstall: supported.ok && !!info.download?.sumsUrl,
    cannotInstallReason: supported.ok ? (info.available && !info.download?.sumsUrl ? 'This release has no installable file for this system.' : null) : supported.reason,
    update: bridge ? bridge.updates.status() : null,
    autoUpdate: settings.autoUpdate,
  }
}

/** The running version and, if the user allows it, whether a newer release is published. */
export const getUpdateInfo = createServerFn({ method: 'GET' }).handler(async (): Promise<UpdateState> => currentState(false))

/** The Check for updates button: asks GitHub now, whatever the kept answer or the setting says. */
export const checkForUpdatesNow = createServerFn({ method: 'POST' }).handler(async (): Promise<UpdateState> => currentState(true))

/** Update now: downloads the newest release, checks it, installs it, and restarts the app. */
export const updateNow = createServerFn({ method: 'POST' }).handler(async (): Promise<UpdateState> => {
  const { desktopBridge } = await import('@/lib/desktop-bridge')
  const bridge = desktopBridge()
  if (!bridge) throw new Error('Updating itself is only available in the desktop app.')
  const state = await currentState(false)
  if (!state.available || !state.download?.sumsUrl) throw new Error(state.cannotInstallReason ?? 'There is no update to install.')
  const supported = bridge.updates.supported()
  if (!supported.ok) throw new Error(supported.reason)
  const status = bridge.updates.status()
  if (status.phase === 'ready' && status.version === state.download.version) bridge.updates.install(true)
  else if (status.phase !== 'downloading' && status.phase !== 'installing') {
    bridge.updates.download({ ...state.download, sumsUrl: state.download.sumsUrl }, true)
  }
  return currentState(false)
})

export const setCheckForUpdates = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const { readSettingsFile, writeSettingsFile } = await import('@/lib/settings-file')
    return writeSettingsFile({ ...readSettingsFile(), checkForUpdates: data.enabled }).checkForUpdates
  })

/** Install updates by themselves: downloaded in the background when found, and installed when the app next quits. */
export const setAutoUpdate = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const { readSettingsFile, writeSettingsFile } = await import('@/lib/settings-file')
    const saved = writeSettingsFile({ ...readSettingsFile(), autoUpdate: data.enabled }).autoUpdate
    const { desktopBridge } = await import('@/lib/desktop-bridge')
    desktopBridge()?.updates.installOnQuit(saved)
    // Turning it on picks up an update that is already out, without waiting for the next round.
    if (saved) void import('@/lib/updates/auto-update').then((m) => m.autoUpdateTick()).catch(() => undefined)
    return saved
  })
