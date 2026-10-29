import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const CLI = path.join(APP_DIR, 'bin', 'cli.mjs')
const HOOK_SCRIPT = path.join(APP_DIR, 'bin', 'claude-dashboard-hook.mjs')

function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf-8', timeout: 15_000 })
}

describe('bin/cli.mjs --print-hook-config', () => {
  it('prints a settings snippet with Notification and Stop hooks', () => {
    const result = runCli(['--print-hook-config'])
    expect(result.status).toBe(0)

    const snippet = JSON.parse(result.stdout)
    for (const event of ['Notification', 'Stop']) {
      expect(snippet.hooks[event]).toHaveLength(1)
      expect(snippet.hooks[event][0].hooks).toEqual([
        { type: 'command', command: `node ${HOOK_SCRIPT}` },
      ])
    }
  })

  it('uses an absolute path to the hook script', () => {
    const snippet = JSON.parse(runCli(['--print-hook-config']).stdout)
    const command: string = snippet.hooks.Stop[0].hooks[0].command
    const scriptPath = command.replace(/^node /, '')
    expect(path.isAbsolute(scriptPath)).toBe(true)
    expect(fs.existsSync(scriptPath)).toBe(true)
  })

  it('does not require a build', () => {
    // The flag is handled before the dist/ pre-flight check, so it works on a fresh checkout.
    const result = runCli(['--print-hook-config'])
    expect(result.status).toBe(0)
    expect(result.stderr).not.toContain('Built files not found')
  })

  it('is listed in --help', () => {
    const result = runCli(['--help'])
    expect(result.stdout).toContain('--print-hook-config')
  })
})
