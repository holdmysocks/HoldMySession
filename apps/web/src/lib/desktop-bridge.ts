/**
 * What the desktop app lets the Settings page do. The server runs inside the app's process, so the app
 * puts these on `globalThis` when it starts (desktop/main.cjs). Run from the command line or a browser
 * build there is no desktop, and `desktopBridge()` is null. Server only.
 */
export interface DesktopBridge {
  getOpenAtLogin(): boolean
  setOpenAtLogin(enabled: boolean): boolean
  restart(): void
  updates: UpdaterBridge
}

export type UpdatePhase = 'idle' | 'downloading' | 'ready' | 'installing' | 'error'

export interface UpdateStatus {
  phase: UpdatePhase
  /** The version being downloaded or waiting to be installed. */
  version: string | null
  /** Download progress, 0 to 100, while downloading. */
  percent: number | null
  error: string | null
}

/** The app's own updater: downloads a release, checks it, and swaps the program for it once the app has quit. */
export interface UpdaterBridge {
  /** Whether this install can replace itself, and if not, why (a folder it may not write to, or a system with no build). */
  supported(): { ok: true } | { ok: false; reason: string }
  status(): UpdateStatus
  /** Starts the download and returns at once. With `installWhenReady` the app then restarts into the new version by itself. */
  download(release: { version: string; name: string; url: string; sumsUrl: string }, installWhenReady: boolean): void
  /** Installs a downloaded update. With `restart` the app starts again afterwards, otherwise it only quits. */
  install(restart: boolean): void
  /** Installs a downloaded update when the app next quits, whenever that is. */
  installOnQuit(enabled: boolean): void
}

export function desktopBridge(): DesktopBridge | null {
  const bridge = (globalThis as { __holdmysessionDesktop?: DesktopBridge }).__holdmysessionDesktop
  return bridge ?? null
}
