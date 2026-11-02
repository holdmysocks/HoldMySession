import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readUsageSnapshot, usageFilePath } from './usage-file'

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../bin/holdmysession-statusline.mjs')
const future = (minutes: number) => Math.floor(Date.now() / 1000) + minutes * 60

describe('bin/holdmysession-statusline.mjs', () => {
  let home: string
  const original = process.env.HOLDMYSESSION_DIR

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-'))
    process.env.HOLDMYSESSION_DIR = home
  })
  afterEach(() => {
    if (original === undefined) delete process.env.HOLDMYSESSION_DIR
    else process.env.HOLDMYSESSION_DIR = original
    fs.rmSync(home, { recursive: true, force: true })
  })

  const run = (input: string) =>
    spawnSync(process.execPath, [SCRIPT], { input, encoding: 'utf-8', env: { ...process.env, HOLDMYSESSION_DIR: home }, timeout: 15_000 })

  const limits = (five?: number, seven?: number) =>
    JSON.stringify({
      session_id: 'abc',
      rate_limits: {
        ...(five === undefined ? {} : { five_hour: { used_percentage: five, resets_at: future(120) } }),
        ...(seven === undefined ? {} : { seven_day: { used_percentage: seven, resets_at: future(60 * 24 * 3) } }),
      },
    })

  it('writes the limits where the app reads them, and prints a short line', () => {
    const r = run(limits(62.4, 18))
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('5h 62% · 7d 18%\n')
    const snap = readUsageSnapshot(usageFilePath())
    expect(snap?.fiveHour?.usedPercentage).toBe(62.4)
    expect(snap?.sevenDay?.usedPercentage).toBe(18)
  })

  it('keeps the other window when a report has only one', () => {
    run(limits(10, 20))
    run(limits(30))
    const snap = readUsageSnapshot(usageFilePath())
    expect(snap?.fiveHour?.usedPercentage).toBe(30)
    expect(snap?.sevenDay?.usedPercentage).toBe(20)
  })

  it('remembers that a 5-hour window was reported, and does not invent one for a plan that has none', () => {
    run(limits(undefined, 20))
    expect(readUsageSnapshot(usageFilePath())?.fiveHourSeenAt).toBeNull()
    run(limits(30, 20))
    const seen = readUsageSnapshot(usageFilePath())?.fiveHourSeenAt
    expect(seen).toBeTruthy()
    run(limits(undefined, 25))
    expect(readUsageSnapshot(usageFilePath())?.fiveHourSeenAt).toBe(seen)
  })

  it('prints only the week for a plan with no 5-hour window', () => {
    expect(run(limits(undefined, 41)).stdout).toBe('7d 41%\n')
  })

  it('writes nothing and prints nothing without limits', () => {
    const r = run(JSON.stringify({ session_id: 'abc', model: { display_name: 'x' } }))
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
    expect(fs.existsSync(path.join(home, 'usage.json'))).toBe(false)
  })

  it.each(['', 'not json', '[]', 'null'])('exits cleanly on odd input %j', (input) => {
    const r = run(input)
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })

  it('passes the input to the previous status line and prints what it printed', () => {
    fs.writeFileSync(path.join(home, 'statusline-previous.json'), JSON.stringify({ command: `"${process.execPath}" -e "process.stdin.on('data',d=>process.stdout.write('prev:'+JSON.parse(d).session_id))"` }))
    const r = run(limits(50, 5))
    expect(r.stdout).toBe('prev:abc')
    // The limits are still recorded.
    expect(readUsageSnapshot(usageFilePath())?.fiveHour?.usedPercentage).toBe(50)
  })

  it('prints nothing, and still exits cleanly, when the previous status line fails', () => {
    fs.writeFileSync(path.join(home, 'statusline-previous.json'), JSON.stringify({ command: 'definitely-not-a-command-xyz' }))
    const r = run(limits(50))
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })
})
