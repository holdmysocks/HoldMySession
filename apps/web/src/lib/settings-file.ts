import * as fs from 'node:fs'
import * as path from 'node:path'
import { dataDir } from '@/lib/data-dir'
import { SettingsSchema, DEFAULT_SETTINGS, type Settings } from '@/features/settings/settings.types'

/** The dashboard's settings file. Server only. */
export function settingsPath(): string {
  return path.join(dataDir(), 'settings.json')
}

/** The saved settings, or the defaults if the file is missing, unreadable or invalid. */
export function readSettingsFile(): Settings {
  try {
    const result = SettingsSchema.safeParse(JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')) as unknown)
    if (result.success) return result.data
    console.warn('Invalid settings file, using defaults:', result.error.message)
    return DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** Writes the settings with the time of the change, through a temporary file so a crash cannot leave half a file. */
export function writeSettingsFile(settings: Settings): Settings {
  const withTimestamp: Settings = { ...settings, updatedAt: new Date().toISOString() }
  const file = settingsPath()
  const tmp = file + '.tmp'
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify(withTimestamp, null, 2), 'utf-8')
    fs.renameSync(tmp, file)
    return withTimestamp
  } catch (error) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`, { cause: error })
  }
}
