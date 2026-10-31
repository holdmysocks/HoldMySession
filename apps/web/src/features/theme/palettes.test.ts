import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { THEMES, DEFAULT_THEME, isThemeId, themeFromStored, themeVariables, themesCss, mix } from './palettes'

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('themes', () => {
  it('has eight themes: four dark, four light, with unique ids', () => {
    expect(THEMES).toHaveLength(8)
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(8)
    expect(THEMES.filter((t) => t.dark)).toHaveLength(4)
    expect(DEFAULT_THEME).toBe('dusk')
  })

  it('makes dark themes dark and light themes light', () => {
    for (const t of THEMES) {
      expect(luminance(t.bg) < 0.5).toBe(t.dark)
      // Text always reads against the page.
      expect(Math.abs(luminance(t.ink) - luminance(t.bg))).toBeGreaterThan(0.6)
    }
  })

  it('derives a gray scale that runs from the page colour to the text colour', () => {
    for (const t of THEMES) {
      const vars = themeVariables(t)
      expect(vars['--color-gray-950']).toBe(t.bg.toLowerCase())
      expect(vars['--color-gray-50']).toBe(t.ink.toLowerCase())
      // Cards are the theme's tile colour, so a light theme has white cards.
      expect(vars['--color-gray-900']).toBe(t.tile)
      const steps = [950, 800, 700, 600, 500, 400, 300, 200, 100, 50].map((s) => luminance(vars[`--color-gray-${s}`]))
      const sorted = [...steps].sort((a, b) => (t.dark ? a - b : b - a))
      expect(steps).toEqual(sorted)
    }
  })

  it('knows which stored values are themes, and maps the old ones', () => {
    expect(isThemeId('nord')).toBe(true)
    expect(isThemeId('dark')).toBe(false)
    expect(themeFromStored('dark')).toBe('dusk')
    expect(themeFromStored('light')).toBe('clay')
    expect(themeFromStored(null)).toBe('dusk')
    expect(themeFromStored('solar')).toBe('solar')
  })

  it('mixes colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#102030', '#102030', 0.7)).toBe('#102030')
  })

  it('keeps themes.css in step with the palettes', () => {
    const file = readFileSync(resolve(process.cwd(), 'src/styles/themes.css'), 'utf-8')
    // If this fails, run `npm run themes` in apps/web.
    expect(file).toBe(themesCss())
  })
})
