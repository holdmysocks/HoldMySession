import { createServerFn } from '@tanstack/react-start'
import { readSettingsFile, writeSettingsFile } from '@/lib/settings-file'
import { SettingsSchema, type Settings } from './settings.types'

export const getSettings = createServerFn({ method: 'GET' }).handler(async (): Promise<Settings> => readSettingsFile())

export const saveSettings = createServerFn({ method: 'POST' })
  .validator((input: Settings) => SettingsSchema.parse(input))
  .handler(async ({ data }): Promise<Settings> => writeSettingsFile(data))
