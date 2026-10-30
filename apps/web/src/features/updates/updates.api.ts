import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { UpdateInfo } from '@/lib/updates/update-check'

export type { UpdateInfo }

/** The running version and, if the user allows it, whether a newer release is published. */
export const getUpdateInfo = createServerFn({ method: 'GET' }).handler(async (): Promise<UpdateInfo & { checking: boolean }> => {
  const { readVersionFromPackageJson } = await import('@/lib/app-version')
  const { readSettingsFile } = await import('@/lib/settings-file')
  const { checkForUpdate, RELEASES_URL } = await import('@/lib/updates/update-check')
  const current = readVersionFromPackageJson()
  if (!readSettingsFile().checkForUpdates) return { current, latest: null, available: false, url: RELEASES_URL, checking: false }
  return { ...(await checkForUpdate(current)), checking: true }
})

export const setCheckForUpdates = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const { readSettingsFile, writeSettingsFile } = await import('@/lib/settings-file')
    return writeSettingsFile({ ...readSettingsFile(), checkForUpdates: data.enabled }).checkForUpdates
  })
