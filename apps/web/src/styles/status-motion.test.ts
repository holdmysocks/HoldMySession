import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'

// Scripts run from apps/web, so the path is relative to that directory.
const css = readFileSync(path.join(process.cwd(), 'src/styles/app.css'), 'utf8')

describe('session status pulse in app.css', () => {
  it('switches every pulse and halo animation off under prefers-reduced-motion', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)
    expect(block).not.toBeNull()
    const body = block![1]
    for (const selector of [
      '.status-pulse-needs-you',
      '.status-pulse-active',
      '.status-halo-needs-you',
      '.status-halo-active',
    ]) {
      expect(body).toContain(selector)
    }
    expect(body).toContain('animation: none')
  })

  it('defines the pulse with keyframes, not JavaScript timers', () => {
    expect(css).toContain('@keyframes status-glow')
    expect(css).toContain('@keyframes status-halo')
  })
})
