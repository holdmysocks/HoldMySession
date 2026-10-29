import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  clearProjectDisplayNameCache,
  originUrl,
  repoNameFromUrl,
  resolveProjectDisplayName,
} from './project-display-name'

describe('resolveProjectDisplayName', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'display-name-'))
    clearProjectDisplayNameCache()
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  function makeProject(name: string): string {
    const dir = path.join(root, name)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  it('uses the package.json name first', async () => {
    const dir = makeProject('folder-name')
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '  @acme/widgets  ' }))
    fs.mkdirSync(path.join(dir, '.git'))
    fs.writeFileSync(
      path.join(dir, '.git', 'config'),
      '[remote "origin"]\n\turl = https://github.com/acme/other-repo.git\n',
    )

    expect(await resolveProjectDisplayName(dir, 'folder-name')).toBe('@acme/widgets')
  })

  it('falls back to the origin remote repo name when package.json has no usable name', async () => {
    const dir = makeProject('folder-name')
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '' }))
    fs.mkdirSync(path.join(dir, '.git'))
    fs.writeFileSync(
      path.join(dir, '.git', 'config'),
      '[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:acme/session-dashboard.git\n',
    )

    expect(await resolveProjectDisplayName(dir, 'folder-name')).toBe('session-dashboard')
  })

  it('falls back to the origin remote when package.json is not valid JSON', async () => {
    const dir = makeProject('folder-name')
    fs.writeFileSync(path.join(dir, 'package.json'), '{ not json')
    fs.mkdirSync(path.join(dir, '.git'))
    fs.writeFileSync(path.join(dir, '.git', 'config'), '[remote "origin"]\n\turl = https://x.test/a/from-remote\n')

    expect(await resolveProjectDisplayName(dir, 'folder-name')).toBe('from-remote')
  })

  it('ignores a non-origin remote', async () => {
    const dir = makeProject('folder-name')
    fs.mkdirSync(path.join(dir, '.git'))
    fs.writeFileSync(path.join(dir, '.git', 'config'), '[remote "upstream"]\n\turl = https://x.test/a/upstream-only.git\n')

    expect(await resolveProjectDisplayName(dir, 'folder-name')).toBe('folder-name')
  })

  it('falls back to the folder name when neither source exists', async () => {
    const dir = makeProject('MCLA')
    expect(await resolveProjectDisplayName(dir, 'MCLA')).toBe('MCLA')
  })

  it('falls back to the folder name for a non-absolute path, without reading anything', async () => {
    expect(await resolveProjectDisplayName('D:/MCLA', 'MCLA')).toBe('MCLA')
  })

  it('caches by path, so a later change on disk is not seen until the cache is cleared', async () => {
    const dir = makeProject('cached')
    expect(await resolveProjectDisplayName(dir, 'cached')).toBe('cached')

    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'later-name' }))
    expect(await resolveProjectDisplayName(dir, 'cached')).toBe('cached')

    clearProjectDisplayNameCache()
    expect(await resolveProjectDisplayName(dir, 'cached')).toBe('later-name')
  })

  it('never writes into the project directory', async () => {
    const dir = makeProject('readonly')
    await resolveProjectDisplayName(dir, 'readonly')
    expect(fs.readdirSync(dir)).toEqual([])
  })
})

describe('originUrl', () => {
  it('returns the url under [remote "origin"]', () => {
    const config = '[remote "upstream"]\n\turl = a\n[remote "origin"]\n\tfetch = +refs/*\n\turl = b\n'
    expect(originUrl(config)).toBe('b')
  })

  it('returns null when there is no origin remote', () => {
    expect(originUrl('[core]\n\tbare = false\n')).toBeNull()
  })
})

describe('repoNameFromUrl', () => {
  it.each([
    ['https://github.com/acme/session-dashboard.git', 'session-dashboard'],
    ['https://github.com/acme/session-dashboard', 'session-dashboard'],
    ['https://github.com/acme/session-dashboard/', 'session-dashboard'],
    ['git@github.com:acme/session-dashboard.git', 'session-dashboard'],
    ['ssh://git@host:2222/team/repo.git', 'repo'],
    ['D:/repos/local-repo.git', 'local-repo'],
    ['C:\\repos\\local-repo', 'local-repo'],
  ])('reads the repo name from %s', (url, expected) => {
    expect(repoNameFromUrl(url)).toBe(expected)
  })

  it('returns null for an empty url', () => {
    expect(repoNameFromUrl('   ')).toBeNull()
  })
})

describe('resolveProjectDisplayName: git layouts', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'display-git-'))
    clearProjectDisplayNameCache()
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  const ORIGIN = '[remote "origin"]\n\turl = https://github.com/acme/rusty-mcla.git\n'

  it('reads origin from a .git folder', async () => {
    const dir = path.join(root, 'plain')
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.git', 'config'), ORIGIN)
    expect(await resolveProjectDisplayName(dir, 'plain')).toBe('rusty-mcla')
  })

  it('follows a .git file with a relative gitdir (a worktree or submodule)', async () => {
    const main = path.join(root, 'main')
    fs.mkdirSync(path.join(main, '.git', 'worktrees', 'wt'), { recursive: true })
    fs.writeFileSync(path.join(main, '.git', 'config'), ORIGIN)
    const wt = path.join(root, 'wt')
    fs.mkdirSync(wt)
    // The worktree's own gitdir has no config; the shared config is named by commondir.
    fs.writeFileSync(path.join(main, '.git', 'worktrees', 'wt', 'commondir'), '../..\n')
    fs.writeFileSync(path.join(wt, '.git'), 'gitdir: ../main/.git/worktrees/wt\n')

    expect(await resolveProjectDisplayName(wt, 'wt')).toBe('rusty-mcla')
  })

  it('follows a .git file whose gitdir has its own config (a submodule)', async () => {
    const sub = path.join(root, 'sub')
    fs.mkdirSync(sub)
    const modules = path.join(root, 'super', '.git', 'modules', 'sub')
    fs.mkdirSync(modules, { recursive: true })
    fs.writeFileSync(path.join(modules, 'config'), ORIGIN)
    fs.writeFileSync(path.join(sub, '.git'), `gitdir: ${modules}\n`)

    expect(await resolveProjectDisplayName(sub, 'sub')).toBe('rusty-mcla')
  })

  it('falls back to the folder name when the .git file points nowhere', async () => {
    const dir = path.join(root, 'broken')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, '.git'), 'gitdir: ../does-not-exist\n')
    expect(await resolveProjectDisplayName(dir, 'broken')).toBe('broken')
  })
})
