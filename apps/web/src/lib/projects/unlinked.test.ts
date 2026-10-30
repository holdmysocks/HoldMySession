import { describe, it, expect } from 'vitest'
import { UNLINKED_PROJECT_KEY, isUnlinkedSession, projectGroupKey } from './unlinked'

const linked = { cwd: '/work/app', projectName: 'app', projectDisplayName: 'My App', projectPath: '/work/app' }

describe('isUnlinkedSession', () => {
  it('is false for a session in a real project', () => {
    expect(isUnlinkedSession(linked)).toBe(false)
  })

  it('is true when no working directory was recorded', () => {
    expect(isUnlinkedSession({ ...linked, cwd: null })).toBe(true)
    expect(isUnlinkedSession({ ...linked, cwd: '   ' })).toBe(true)
  })

  it('is true for a scratch folder, whatever its case, by folder or display name', () => {
    expect(isUnlinkedSession({ ...linked, projectName: 'scratch' })).toBe(true)
    expect(isUnlinkedSession({ ...linked, projectName: 'Scratch' })).toBe(true)
    expect(isUnlinkedSession({ ...linked, projectDisplayName: ' SCRATCH ' })).toBe(true)
  })

  it('is false for a project that only contains the word', () => {
    expect(isUnlinkedSession({ ...linked, projectName: 'scratchpad-app' })).toBe(false)
  })
})

describe('projectGroupKey', () => {
  it('uses the project path for a linked session and one shared key for unlinked ones', () => {
    expect(projectGroupKey(linked)).toBe('/work/app')
    expect(projectGroupKey({ ...linked, cwd: null, projectPath: 'dir-a' })).toBe(UNLINKED_PROJECT_KEY)
    expect(projectGroupKey({ ...linked, projectName: 'scratch', projectPath: '/x/scratch' })).toBe(UNLINKED_PROJECT_KEY)
  })
})
