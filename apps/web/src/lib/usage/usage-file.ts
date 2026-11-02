import * as fs from 'node:fs'
import * as path from 'node:path'
import { dataDir } from '@/lib/data-dir'
import { snapshotFromStored, type UsageSnapshot } from './limits'

/**
 * Where the status line script leaves the limits Claude Code reports. bin/holdmysession-statusline.mjs is
 * the only writer and repeats this path; its test checks the two agree.
 */
export function usageFilePath(): string {
  return path.join(dataDir(), 'usage.json')
}

/** The last report on this computer, or null if there is none or the file is not one. */
export function readUsageSnapshot(file: string = usageFilePath()): UsageSnapshot | null {
  try {
    return snapshotFromStored(JSON.parse(fs.readFileSync(file, 'utf-8')))
  } catch {
    return null
  }
}
