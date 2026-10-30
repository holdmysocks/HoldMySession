import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'

// Scripts run from apps/web, so the path is relative to that directory.
const css = readFileSync(path.join(process.cwd(), 'src/styles/app.css'), 'utf8')

/**
 * The declarations of a top-level rule such as `.status-pulse-active { ... }`. The selector
 * must start its line, so a selector inside a grouped rule or a media block is not matched.
 */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm'))
  expect(match, `rule ${selector} exists`).not.toBeNull()
  return match![1]
}

describe('session status pulse in app.css', () => {
  it('switches every pulse, halo and border animation off under prefers-reduced-motion', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)
    expect(block).not.toBeNull()
    const body = block![1]
    for (const selector of [
      '.status-pulse-needs-you',
      '.status-pulse-active',
      '.status-halo-needs-you',
      '.status-halo-active',
      '.status-edge-needs-you',
    ]) {
      expect(body).toContain(selector)
    }
    expect(body).toContain('animation: none')
  })

  it('hides the map halo under reduced motion, so it does not show as a solid ring', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)!
    expect(block[1]).toMatch(/\.status-halo-needs-you,\s*\.status-halo-active\s*\{\s*opacity: 0;/)
  })

  it('defines the pulse with keyframes, not JavaScript timers', () => {
    for (const name of [
      'status-glow-needs-you',
      'status-glow-active',
      'status-halo-needs-you',
      'status-halo-active',
      'status-edge-needs-you',
    ]) {
      expect(css).toContain(`@keyframes ${name}`)
    }
  })

  it('times the needs-you pulse at 1.2s and the active pulse at 2.4s', () => {
    expect(ruleBody('.status-pulse-needs-you')).toContain('1.2s')
    expect(ruleBody('.status-pulse-active')).toContain('2.4s')
    expect(ruleBody('.status-halo-needs-you')).toContain('1.2s')
    expect(ruleBody('.status-halo-active')).toContain('2.4s')
  })

  it('grows the card glow to 14px for needs-you and 10px for active', () => {
    expect(css).toMatch(/@keyframes status-glow-needs-you[\s\S]*?14px rgb\(250 204 21 \/ 0\.9\)/)
    expect(css).toMatch(/@keyframes status-glow-active[\s\S]*?10px rgb\(34 197 94 \/ 0\.7\)/)
  })

  it('scales the map halo from 1 to 1.03 around the centre of its box', () => {
    expect(css).toMatch(/@keyframes status-halo-needs-you[\s\S]*?scale\(1\.03\)/)
    expect(css).toMatch(/@keyframes status-halo-active[\s\S]*?scale\(1\.03\)/)
    for (const selector of ['.status-halo-needs-you', '.status-halo-active']) {
      expect(ruleBody(selector)).toContain('transform-box: fill-box')
      expect(ruleBody(selector)).toContain('transform-origin: center')
    }
  })

  it('has no pulse on completed or idle, which have no status-pulse class', () => {
    expect(css).not.toMatch(/\.status-pulse-completed|\.status-pulse-idle|\.status-halo-completed|\.status-halo-idle/)
  })
})
