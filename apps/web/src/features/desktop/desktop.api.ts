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
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data }): Promise<DesktopState> => {
    const { desktopBridge } = await import('@/lib/desktop-bridge')
    const bridge = desktopBridge()
    if (!bridge) throw new Error('This is only available in the desktop app.')
    const { readSettingsFile } = await import('@/lib/settings-file')
    return { desktop: true, openAtLogin: bridge.setOpenAtLogin(data.enabled), alerts: readSettingsFile().needsYouAlerts, platform: process.platform }
  })

/** Turns the needs-you alerts on or off. The desktop app reads the setting each time it asks which sessions wait. */
export const setNeedsYouAlerts = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data }): Promise<DesktopState> => {
    const { desktopBridge } = await import('@/lib/desktop-bridge')
    const { readSettingsFile, writeSettingsFile } = await import('@/lib/settings-file')
    writeSettingsFile({ ...readSettingsFile(), needsYouAlerts: data.enabled })
    const bridge = desktopBridge()
    return { desktop: bridge !== null, openAtLogin: bridge?.getOpenAtLogin() ?? false, alerts: data.enabled, platform: process.platform }
  })
