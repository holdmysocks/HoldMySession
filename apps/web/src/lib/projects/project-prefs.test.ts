import { describe, expect, it } from 'vitest'
import { dropdownKey, isProjectHidden, labelScratch, visibleInLists, type ProjectPrefs } from './project-prefs'
import { UNLINKED_PROJECT_KEY } from './unlinked'

const session = (over: Partial<Parameters<typeof labelScratch>[0][number]> = {}) => ({
  cwd: '/w/app', projectName: 'app', projectDisplayName: 'app', projectPath: '/w/app', sessionName: null as string | null, ...over,
})
const scratch = (name = 'Fix the thing') =>
  session({ cwd: '/tmp/scratch-1a2b', projectName: 'scratch-1a2b', projectDisplayName: 'scratch-1a2b', projectPath: '/tmp/scratch-1a2b', sessionName: name })
const prefs = (over: Partial<ProjectPrefs> = {}): ProjectPrefs => ({ scratch: 'group', scratchByName: false, hidden: [], ...over })
const self = () => 'm1'

describe('visibleInLists', () => {
  it('keeps scratch sessions unless they are hidden', () => {
    const all = [session(), scratch()]
    expect(visibleInLists(all, prefs(), self)).toHaveLength(2)
    expect(visibleInLists(all, prefs({ scratch: 'show' }), self)).toHaveLength(2)
    expect(visibleInLists(all, prefs({ scratch: 'hide' }), self)).toEqual([all[0]])
  })

  it('hides a project on one machine only', () => {
    const a = { ...session(), machine: 'm1' }
    const b = { ...session(), machine: 'm2' }
    const p = prefs({ hidden: [{ machineId: 'm2', projectPath: '/w/app' }] })
    expect(visibleInLists([a, b], p, (s) => s.machine)).toEqual([a])
    expect(isProjectHidden(p, 'm2', '/w/app')).toBe(true)
    expect(isProjectHidden(p, 'm1', '/w/app')).toBe(false)
  })
})

describe('labelScratch', () => {
  it('calls grouped scratch sessions Unlinked Sessions', () => {
    const [out] = labelScratch([scratch()], prefs())
    expect(out.projectDisplayName).toBe('Unlinked Sessions')
  })

  it('uses the session name when asked, falling back to the group name', () => {
    expect(labelScratch([scratch()], prefs({ scratchByName: true }))[0].projectDisplayName).toBe('Fix the thing')
    expect(labelScratch([scratch('  ')], prefs({ scratchByName: true }))[0].projectDisplayName).toBe('Unlinked Sessions')
  })

  it('leaves scratch folders alone when listed as they are, and never touches real projects', () => {
    const s = scratch()
    expect(labelScratch([s], prefs({ scratch: 'show' }))[0]).toBe(s)
    const real = session()
    expect(labelScratch([real], prefs({ scratchByName: true }))[0]).toBe(real)
  })
})

describe('dropdownKey', () => {
  it('shares one key for grouped scratch sessions', () => {
    expect(dropdownKey(scratch(), 'group')).toBe(UNLINKED_PROJECT_KEY)
    expect(dropdownKey(scratch(), 'show')).toBe('scratch-1a2b')
    expect(dropdownKey(session(), 'group')).toBe('app')
  })
})
