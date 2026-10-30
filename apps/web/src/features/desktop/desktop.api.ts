import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export interface DesktopState {
  /** Running inside the desktop app. Everything else on the card is hidden when it is not. */
  desktop: boolean
  openAtLogin: boolean
  platform: string
}

export const getDesktopState = createServerFn({ method: 'GET' }).handler(async (): Promise<DesktopState> => {
  const { desktopBridge } = await import('@/lib/desktop-bridge')
  const bridge = desktopBridge()
  return { desktop: bridge !== null, openAtLogin: bridge?.getOpenAtLogin() ?? false, platform: process.platform }
})

/** Turns "start with the computer" on or off, and answers with what the system now says. */
export const setOpenAtLogin = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data }): Promise<DesktopState> => {
    const { desktopBridge } = await import('@/lib/desktop-bridge')
    const bridge = desktopBridge()
    if (!bridge) throw new Error('This is only available in the desktop app.')
    return { desktop: true, openAtLogin: bridge.setOpenAtLogin(data.enabled), platform: process.platform }
  })
