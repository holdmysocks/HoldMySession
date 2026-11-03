import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { addHook, hookCommands, installedCommand, isHookComplete, isHookInstalled, removeHook } from './claude-hooks'

const commands = hookCommands({ appDir: 'C:\\Apps\\HoldMySession\\apps\\web' })

describe('hook commands', () => {
  it('uses the installed program with flags, with forward slashes so any shell reads the path', () => {
    const c = hookCommands({ exePath: 'C:\\Program Files\\HoldMySession\\HoldMySession.exe', appDir: 'x' })
    expect(c.notify).toBe('"C:/Program Files/HoldMySession/HoldMySession.exe" --holdmysession-notify')
    expect(c.start).toBe('"C:/Program Files/HoldMySession/HoldMySession.exe" --holdmysession-start')
  })
  it('runs the notify hook as plain Node on a Mac, so no Dock icon flashes, and still starts the app with its flag', () => {
    const c = hookCommands({ exePath: '/Applications/HoldMySession.app/Contents/MacOS/HoldMySession', appDir: '/Applications/HoldMySession.app/Contents/Resources/app.asar/web', platform: 'darwin' })
    expect(c.notify).toBe('ELECTRON_RUN_AS_NODE=1 "/Applications/HoldMySession.app/Contents/MacOS/HoldMySession" "/Applications/HoldMySession.app/Contents/Resources/app.asar/web/bin/holdmysession-hook.mjs"')
    expect(c.start).toBe('"/Applications/HoldMySession.app/Contents/MacOS/HoldMySession" --holdmysession-start')
    // Both are recognised as ours, so they are found, updated in place and removed like the others.
    expect(isHookInstalled(addHook(addHook({}, 'notify', c.notify), 'start', c.start), 'notify')).toBe(true)
    expect(installedCommand(addHook({}, 'notify', c.notify), 'notify')).toBe(c.notify)
    expect(isHookInstalled(removeHook(addHook({}, 'notify', c.notify), 'notify'), 'notify')).toBe(false)
  })
  it('keeps the flags on Windows', () => {
    expect(hookCommands({ exePath: 'C:\\H\\HoldMySession.exe', appDir: 'x', platform: 'win32' }).notify).toBe('"C:/H/HoldMySession.exe" --holdmysession-notify')
  })
  it('uses node and the scripts of a source checkout', () => {
    expect(commands.notify).toBe('node "C:/Apps/HoldMySession/apps/web/bin/holdmysession-hook.mjs"')
    expect(commands.start).toBe('node "C:/Apps/HoldMySession/apps/web/bin/ensure-running.mjs"')
  })
})

describe('adding and removing', () => {
  it('adds the notify hook to Notification and Stop in an empty file', () => {
    const s = addHook({}, 'notify', commands.notify)
    expect(s).toEqual({
      hooks: {
        Notification: [{ hooks: [{ type: 'command', command: commands.notify }] }],
        Stop: [{ hooks: [{ type: 'command', command: commands.notify }] }],
      },
    })
    expect(isHookInstalled(s, 'notify')).toBe(true)
    expect(isHookInstalled(s, 'start')).toBe(false)
  })

  it('keeps everything else: other settings, other hooks and other groups on the same event', () => {
    const before = {
      model: 'opus',
      permissions: { allow: ['Bash(ls)'] },
      hooks: {
        Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo mine' }] }],
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'check.sh' }] }],
      },
    }
    const added = addHook(before, 'notify', commands.notify) as typeof before
    expect(added.model).toBe('opus')
    expect(added.permissions).toEqual(before.permissions)
    expect(added.hooks.PreToolUse).toEqual(before.hooks.PreToolUse)
    expect(added.hooks.Stop).toHaveLength(2)
    expect(added.hooks.Stop[0]).toEqual(before.hooks.Stop[0])
    // Removing it again gives back what was there.
    expect(removeHook(added, 'notify')).toEqual(before)
  })

  it('does not change what it was given', () => {
    const before = { hooks: { Stop: [] } }
    const copy = JSON.parse(JSON.stringify(before))
    addHook(before, 'notify', commands.notify)
    removeHook(before, 'notify')
    expect(before).toEqual(copy)
  })

  it('updates its own command in place instead of adding a second one', () => {
    const once = addHook({}, 'notify', 'node "/old/bin/holdmysession-hook.mjs"')
    const twice = addHook(once, 'notify', commands.notify) as { hooks: Record<string, Array<{ hooks: unknown[] }>> }
    expect(twice.hooks.Notification).toHaveLength(1)
    expect(twice.hooks.Notification[0].hooks).toEqual([{ type: 'command', command: commands.notify }])
    expect(installedCommand(twice, 'notify')).toBe(commands.notify)
  })

  it('removes only its own entry from a group that also holds another hook', () => {
    const s = {
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }, { type: 'command', command: commands.notify }] }],
        Notification: [{ hooks: [{ type: 'command', command: commands.notify }] }],
      },
    }
    expect(removeHook(s, 'notify')).toEqual({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } })
  })

  it('removes the hooks key when nothing is left, and is a no-op when it was never there', () => {
    expect(removeHook(addHook({ a: 1 }, 'start', commands.start), 'start')).toEqual({ a: 1 })
    expect(removeHook({ a: 1 }, 'start')).toEqual({ a: 1 })
  })

  it('treats the two hooks separately, and recognises the installed program\'s flags', () => {
    const s = addHook(addHook({}, 'notify', '"/x/HoldMySession.exe" --holdmysession-notify'), 'start', '"/x/HoldMySession.exe" --holdmysession-start')
    expect(isHookInstalled(s, 'notify')).toBe(true)
    expect(isHookInstalled(s, 'start')).toBe(true)
    const noStart = removeHook(s, 'start')
    expect(isHookInstalled(noStart, 'notify')).toBe(true)
    expect(isHookInstalled(noStart, 'start')).toBe(false)
  })

  it('does not mistake a hook of someone else for ours', () => {
    expect(isHookInstalled({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] } }, 'notify')).toBe(false)
    expect(isHookInstalled(null, 'notify')).toBe(false)
    expect(isHookInstalled({ hooks: 'nonsense' }, 'notify')).toBe(false)
    expect(isHookComplete(null, 'notify')).toBe(false)
  })

  it('counts a hook in some of its events as installed, but not complete', () => {
    const partly = { hooks: { Stop: [{ hooks: [{ type: 'command', command: commands.notify }] }] } }
    expect(isHookInstalled(partly, 'notify')).toBe(true)
    expect(isHookComplete(partly, 'notify')).toBe(false)
    expect(isHookComplete(addHook({}, 'notify', commands.notify), 'notify')).toBe(true)
  })

  it('starts HoldMySession on a message as well as a session, and an older start hook is completed in place', () => {
    const older = { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: commands.start }] }] } }
    expect(isHookInstalled(older, 'start')).toBe(true)
    expect(isHookComplete(older, 'start')).toBe(false)
    const upgraded = addHook(older, 'start', commands.start) as { hooks: Record<string, unknown[]> }
    expect(isHookComplete(upgraded, 'start')).toBe(true)
    // The command that was there is updated, not added twice.
    expect(upgraded.hooks.SessionStart).toHaveLength(1)
    expect(upgraded.hooks.UserPromptSubmit).toHaveLength(1)
    expect(Object.keys(removeHook(upgraded, 'start'))).toEqual([])
  })
})

describe('the settings file', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-hooks-'))
    vi.stubEnv('CLAUDE_CONFIG_DIR', path.join(dir, 'claude'))
    vi.stubEnv('HOLDMYSESSION_DIR', path.join(dir, 'data'))
    vi.stubEnv('HOLDMYSESSION_APP_DIR', '/app/apps/web')
    vi.stubEnv('HOLDMYSESSION_EXE', '')
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  async function files() {
    return import('./claude-settings-file')
  }

  it('creates the file when there is none, and removes the hook again', async () => {
    const f = await files()
    expect(f.readHookState()).toMatchObject({ readable: true, notify: false, start: false, error: null })
    const on = f.setHook('notify', true)
    expect(on.notify).toBe(true)
    expect(JSON.parse(fs.readFileSync(f.claudeSettingsPath(), 'utf-8')).hooks.Stop).toBeDefined()
    expect(f.setHook('notify', false).notify).toBe(false)
  })

  it('keeps a copy of the file before changing it, outside the Claude folder', async () => {
    const f = await files()
    fs.mkdirSync(path.dirname(f.claudeSettingsPath()), { recursive: true })
    fs.writeFileSync(f.claudeSettingsPath(), JSON.stringify({ model: 'opus' }))
    f.setHook('start', true)
    const backups = fs.readdirSync(path.join(dir, 'data', 'claude-settings-backups'))
    expect(backups).toHaveLength(1)
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'data', 'claude-settings-backups', backups[0]), 'utf-8'))).toEqual({ model: 'opus' })
    expect(fs.readdirSync(path.dirname(f.claudeSettingsPath()))).toEqual(['settings.json'])
  })

  it('refuses to touch a file that is not valid JSON, and says so', async () => {
    const f = await files()
    fs.mkdirSync(path.dirname(f.claudeSettingsPath()), { recursive: true })
    fs.writeFileSync(f.claudeSettingsPath(), '{ "model": "opus", }')
    expect(f.readHookState()).toMatchObject({ readable: false, notify: false })
    expect(f.readHookState().error).toMatch(/not valid JSON/)
    expect(() => f.setHook('notify', true)).toThrow(/not valid JSON/)
    expect(fs.readFileSync(f.claudeSettingsPath(), 'utf-8')).toBe('{ "model": "opus", }')
  })

  it('does not rewrite the file when nothing changes', async () => {
    const f = await files()
    f.setHook('notify', true)
    const before = fs.statSync(f.claudeSettingsPath()).mtimeMs
    f.setHook('notify', true)
    expect(fs.statSync(f.claudeSettingsPath()).mtimeMs).toBe(before)
    expect(fs.existsSync(path.join(dir, 'data', 'claude-settings-backups'))).toBe(false)
  })

  it('reports a hook whose command is out of date, as after the app moved', async () => {
    const f = await files()
    fs.mkdirSync(path.dirname(f.claudeSettingsPath()), { recursive: true })
    fs.writeFileSync(
      f.claudeSettingsPath(),
      JSON.stringify(addHook({}, 'notify', 'node "/somewhere/else/bin/holdmysession-hook.mjs"')),
    )
    expect(f.readHookState()).toMatchObject({ notify: true, stale: { notify: true, start: false } })
    expect(f.setHook('notify', true).stale.notify).toBe(false)
  })
})
