import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const shared = vi.hoisted(() => ({ root: '', sources: [] as unknown[] }))

vi.mock('@/lib/utils/claude-path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/claude-path')>()
  return {
    ...actual,
    getProjectsDir: () => path.join(shared.root, 'primary', 'projects'),
    getProjectsDirFor: (source: { claudeDir: string }) => path.join(source.claudeDir, 'projects'),
    getDataSources: async () => shared.sources,
  }
})

import type { DataSource } from '@/lib/utils/claude-path'
import { scanProjects, scanProjectsFrom, scanAllProjects, clearProjectCwdCache } from './project-scanner'

/** Write a project directory with one session file per entry; each entry is the file's lines. */
function writeProject(projectsDir: string, dirName: string, sessions: Record<string, string[]>) {
  const dir = path.join(projectsDir, dirName)
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, lines] of Object.entries(sessions)) {
    fs.writeFileSync(path.join(dir, `${name}.jsonl`), lines.join('\n') + '\n')
  }
}

const summaryLine = JSON.stringify({ type: 'summary', summary: 'Title', leafUuid: 'x' })
const withCwd = (cwd: string) => JSON.stringify({ type: 'user', cwd, message: { role: 'user', content: 'hi' } })

describe('project scanner: project identity', () => {
  let projectsDir: string

  beforeEach(() => {
    shared.root = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-identity-'))
    projectsDir = path.join(shared.root, 'primary', 'projects')
    fs.mkdirSync(projectsDir, { recursive: true })
    clearProjectCwdCache()
    shared.sources = []
  })

  afterEach(() => {
    fs.rmSync(shared.root, { recursive: true, force: true })
  })

  it('takes the path from the recorded cwd, not from the directory name (Windows D:\\MCLA)', async () => {
    // Claude Code writes D--MCLA for D:\MCLA. The cwd in the transcript is the truth.
    writeProject(projectsDir, 'D--MCLA', { s1: [summaryLine, withCwd('D:\\MCLA')] })

    const [project] = await scanProjects()
    expect(project.dirName).toBe('D--MCLA')
    expect(project.projectPath).toBe('D:\\MCLA')
    expect(project.projectName).toBe('MCLA')
    expect(project.cwdKnown).toBe(true)
  })

  it('keeps hyphens in a folder name, which decoding would have split', async () => {
    writeProject(projectsDir, '-home-user-my-cool-app', { s1: [withCwd('/home/user/my-cool-app')] })

    const [project] = await scanProjects()
    expect(project.projectPath).toBe('/home/user/my-cool-app')
    expect(project.projectName).toBe('my-cool-app')
  })

  it('keeps dots in a folder name', async () => {
    writeProject(projectsDir, '-work-app-v2-3', { s1: [withCwd('/work/app.v2.3')] })

    const [project] = await scanProjects()
    expect(project.projectName).toBe('app.v2.3')
  })

  it('reads a UNC cwd without decoding it', async () => {
    writeProject(projectsDir, 'UNC-share-proj', { s1: [withCwd('\\\\server\\share\\proj')] })

    const [project] = await scanProjects()
    expect(project.projectPath).toBe('\\\\server\\share\\proj')
    expect(project.projectName).toBe('proj')
  })

  it('uses the first record that has a cwd, even when it is not the first line', async () => {
    writeProject(projectsDir, '-work-app', {
      s1: [summaryLine, JSON.stringify({ type: 'file-history-snapshot' }), withCwd('/work/app')],
    })

    const [project] = await scanProjects()
    expect(project.projectPath).toBe('/work/app')
  })

  it('looks past a session file with no cwd to the next one that has it', async () => {
    writeProject(projectsDir, '-work-app', {
      a: [summaryLine],
      b: [withCwd('/work/app')],
    })

    const [project] = await scanProjects()
    expect(project.projectPath).toBe('/work/app')
    expect(project.cwdKnown).toBe(true)
  })

  it('falls back to the directory name when no record has a cwd, and does not decode it', async () => {
    writeProject(projectsDir, 'D--MCLA', { s1: [summaryLine] })

    const [project] = await scanProjects()
    expect(project.projectPath).toBe('D--MCLA')
    expect(project.projectName).toBe('D--MCLA')
    expect(project.cwdKnown).toBe(false)
  })

  it('ignores a cwd that is not a string', async () => {
    writeProject(projectsDir, 'odd', { s1: [JSON.stringify({ type: 'user', cwd: 42 })] })

    const [project] = await scanProjects()
    expect(project.cwdKnown).toBe(false)
  })

  it('skips directories with no session files and non-jsonl files', async () => {
    writeProject(projectsDir, '-work-real', { s1: [withCwd('/work/real')] })
    fs.mkdirSync(path.join(projectsDir, '-work-empty'))
    fs.writeFileSync(path.join(projectsDir, '-work-empty', 'notes.txt'), 'x')

    const projects = await scanProjects()
    expect(projects.map((p) => p.dirName)).toEqual(['-work-real'])
  })

  it('returns [] when the projects directory does not exist', async () => {
    fs.rmSync(projectsDir, { recursive: true, force: true })
    expect(await scanProjects()).toEqual([])
  })

  it('tags projects from a data source with its id and label', async () => {
    const other = path.join(shared.root, 'wsl', '.claude')
    writeProject(path.join(other, 'projects'), '-home-u-app', { s1: [withCwd('/home/u/app')] })
    const source: DataSource = {
      id: 'wsl-ubuntu-u',
      label: 'WSL - Ubuntu',
      claudeDir: other,
      platform: 'wsl',
      available: true,
    }

    const projects = await scanProjectsFrom(source)
    expect(projects).toEqual([
      expect.objectContaining({
        dirName: '-home-u-app',
        projectPath: '/home/u/app',
        sourceId: 'wsl-ubuntu-u',
        sourceLabel: 'WSL - Ubuntu',
      }),
    ])
  })

  it('merges projects from available sources and skips unavailable ones', async () => {
    const extra = path.join(shared.root, 'extra', '.claude')
    writeProject(path.join(extra, 'projects'), '-x', { s1: [withCwd('/x')] })
    const gone = path.join(shared.root, 'gone', '.claude')
    shared.sources = [
      { id: 'extra', label: 'Extra', claudeDir: extra, platform: 'linux', available: true },
      { id: 'gone', label: 'Gone', claudeDir: gone, platform: 'linux', available: false },
    ]

    const projects = await scanAllProjects()
    expect(projects.map((p) => p.sourceId)).toEqual(['extra'])
  })
})
