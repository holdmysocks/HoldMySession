import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export interface DesktopState {
  /** Running inside the desktop app. Everything else on the card is hidden when it is not. */
  desktop: boolean
  openAtLogin: boolean
  /** A notification and a tray count when a session starts waiting on the user. */
  alerts: boolean
  platform: string
}

export const getDesktopState = createServerFn({ method: 'GET' }).handler(async (): Promise<DesktopState> => {
  const { desktopBridge } = await import('@/lib/desktop-bridge')
  const bridge = desktopBridge()
  const { readSettingsFile } = await import('@/lib/settings-file')
  return { desktop: bridge !== null, openAtLogin: bridge?.getOpenAtLogin() ?? false, alerts: readSettingsFile().needsYouAlerts, platform: process.platform }
})

/** Turns "start with the computer" on or off, and answers with what the system now says. */
export const setOpenAtLogin = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data }): Promise<DesktopState> => {
    const { desktopBridge } = await import('@/lib/desktop-bridge')
    const bridge = desktopBridge()
    if (!bridge) throw new Error('This is only available in the desktop app.')
    const { readSettingsFile } = await import('@/lib/settings-file')
    return { desktop: true, openAtLogin: bridge.setOpenAtLogin(data.enabled), alerts: readSettingsFile().needsYouAlerts, platform: process.platform }
  })

/**
 * Whether the desktop app quits when Claude Code has gone unused, and after how long. Written to the settings file,
 * which the desktop program reads itself, since it may not be asking the server at the time.
 */
export const setIdleQuit = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ quit: z.boolean().optional(), minutes: z.union([z.literal(10), z.literal(30), z.literal(60), z.literal(120)]).optional() }).parse(input))
  .handler(async ({ data }): Promise<{ quit: boolean; minutes: 10 | 30 | 60 | 120 }> => {
    const { readSettingsFile, writeSettingsFile } = await import('@/lib/settings-file')
    const current = readSettingsFile()
    const idle = { quit: data.quit ?? current.idle.quit, minutes: data.minutes ?? current.idle.minutes }
    writeSettingsFile({ ...current, idle })
    return idle
  })

/**
 * Whether the window opens when the Claude Code start hook starts the app. Off, it starts straight in the tray. Written to
 * the settings file, which the program the hook runs reads itself, before any server is up.
 */
export const setShowWindowOnHookStart = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data }): Promise<boolean> => {
    const { readSettingsFile, writeSettingsFile } = await import('@/lib/settings-file')
    writeSettingsFile({ ...readSettingsFile(), showWindowOnHookStart: data.enabled })
    return data.enabled
  })

/** Turns the needs-you alerts on or off. The desktop app reads the setting each time it asks which sessions wait. */
export const setNeedsYouAlerts = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data }): Promise<DesktopState> => {
    const { desktopBridge } = await import('@/lib/desktop-bridge')
    const { readSettingsFile, writeSettingsFile } = await import('@/lib/settings-file')
    writeSettingsFile({ ...readSettingsFile(), needsYouAlerts: data.enabled })
    const bridge = desktopBridge()
    return { desktop: bridge !== null, openAtLogin: bridge?.getOpenAtLogin() ?? false, alerts: data.enabled, platform: process.platform }
  })
