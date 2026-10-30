/**
 * What the desktop app lets the Settings page do. The server runs inside the app's process, so the app
 * puts these on `globalThis` when it starts (desktop/main.cjs). Run from the command line or a browser
 * build there is no desktop, and `desktopBridge()` is null. Server only.
 */
export interface DesktopBridge {
  getOpenAtLogin(): boolean
  setOpenAtLogin(enabled: boolean): boolean
  restart(): void
}

export function desktopBridge(): DesktopBridge | null {
  const bridge = (globalThis as { __holdmysessionDesktop?: DesktopBridge }).__holdmysessionDesktop
  return bridge ?? null
}
