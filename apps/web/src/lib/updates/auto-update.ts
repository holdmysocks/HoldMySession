import { readSettingsFile } from '@/lib/settings-file'
import { readVersionFromPackageJson } from '@/lib/app-version'
import { desktopBridge } from '@/lib/desktop-bridge'
import { checkForUpdate } from './update-check'

const FIRST_CHECK_MS = 30_000
const EVERY_MS = 6 * 60 * 60_000

/**
 * One round of automatic updating, in the desktop app: if a newer release has a file for this system,
 * download it in the background. It is installed when the app next quits, or at once from Settings.
 * Does nothing when updates are off, there is no desktop app, or a download is already under way.
 */
export async function autoUpdateTick(): Promise<void> {
  const bridge = desktopBridge()
  const settings = readSettingsFile()
  if (!bridge) return
  bridge.updates.installOnQuit(settings.autoUpdate)
  if (!settings.checkForUpdates || !settings.autoUpdate) return
  if (!bridge.updates.supported().ok) return
  const status = bridge.updates.status()
  if (status.phase === 'downloading' || status.phase === 'installing') return

  const info = await checkForUpdate(readVersionFromPackageJson())
  if (!info.available || !info.download?.sumsUrl) return
  if (status.phase === 'ready' && status.version === info.download.version) return
  bridge.updates.download({ ...info.download, sumsUrl: info.download.sumsUrl }, false)
}

let started = false

/** Checks shortly after start, then every few hours. Safe to call any number of times. */
export function startAutoUpdate(): void {
  if (started) return
  started = true
  const run = () => void autoUpdateTick().catch((error) => console.warn('Automatic update check failed:', error))
  setTimeout(run, FIRST_CHECK_MS).unref?.()
  setInterval(run, EVERY_MS).unref?.()
}
