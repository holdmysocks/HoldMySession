/**
 * The app's themes. Each one is a handful of colours. From them we derive the whole gray scale and the
 * brand scale that every component already uses, so a theme changes the page background, the cards,
 * the text, the borders and the accent together. Pure, with no imports, so the script that writes
 * `src/styles/themes.css` can load it too.
 */

export interface ThemePalette {
  id: string
  label: string
  note: string
  /** A dark page. Sets `color-scheme` so form controls and scrollbars match. */
  dark: boolean
  /** The page background. */
  bg: string
  /** Cards and raised surfaces. */
  tile: string
  /** Body text. */
  ink: string
  /** Secondary text. */
  mute: string
  /** Headline numbers and the open page in the menu. */
  acc: string
  accLight: string
  /** Fills: buttons, bars, heatmap cells. */
  hero: string
}

export const THEMES = [
  { id: 'dusk', label: 'Dusk', note: 'Default', dark: true, bg: '#0F0E0D', tile: '#1F1E1D', ink: '#FAF9F5', mute: '#A8A69C', acc: '#F0906F', accLight: '#FFB38F', hero: '#D97757' },
  { id: 'ink', label: 'Ink', note: 'True black', dark: true, bg: '#000000', tile: '#141413', ink: '#FAF9F5', mute: '#A8A69C', acc: '#F0906F', accLight: '#FFB38F', hero: '#D97757' },
  { id: 'dracula', label: 'Dracula', note: 'Dark, purple and pink', dark: true, bg: '#282A36', tile: '#343746', ink: '#F8F8F2', mute: '#B4B8D0', acc: '#FF79C6', accLight: '#FFA6DA', hero: '#BD93F9' },
  { id: 'nord', label: 'Nord', note: 'Dark, arctic blue', dark: true, bg: '#2E3440', tile: '#3B4252', ink: '#ECEFF4', mute: '#AEB8CA', acc: '#88C0D0', accLight: '#B1DCE8', hero: '#5E81AC' },
  { id: 'clay', label: 'Clay', note: 'Light, warm', dark: false, bg: '#EFEDE4', tile: '#FFFFFF', ink: '#141413', mute: '#5E5D59', acc: '#B4492A', accLight: '#D97757', hero: '#D97757' },
  { id: 'sage', label: 'Sage', note: 'Light, green', dark: false, bg: '#E3E8DD', tile: '#F7F9F4', ink: '#1B2118', mute: '#515A4C', acc: '#4F6B35', accLight: '#788C5D', hero: '#788C5D' },
  { id: 'alucard', label: 'Alucard', note: 'Light, purple', dark: false, bg: '#FFFBEB', tile: '#FFFFFF', ink: '#1F1F1F', mute: '#5C5963', acc: '#644AC9', accLight: '#8F7BE0', hero: '#644AC9' },
  { id: 'solar', label: 'Solar', note: 'Light, cream and blue', dark: false, bg: '#FDF6E3', tile: '#EEE8D5', ink: '#073642', mute: '#586E75', acc: '#268BD2', accLight: '#5AA9E0', hero: '#CB4B16' },
] as const satisfies readonly ThemePalette[]

export type ThemeId = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: ThemeId = 'dusk'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((t) => t.id === value)
}

/**
 * What was saved by an older version. It stored 'dark' or 'light'. The old dark is Dusk, and the old
 * light is Clay, the closest of the new themes. Anything else falls back to the default.
 */
export function themeFromStored(stored: string | null | undefined): ThemeId {
  if (isThemeId(stored)) return stored
  if (stored === 'light') return 'clay'
  return DEFAULT_THEME
}

export function paletteOf(id: string): ThemePalette {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

// --- colour maths for the derived scales ---

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

/** `t` of the way from `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = parse(a)
  const y = parse(b)
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

/** How far each gray step is from the page colour toward the text colour. 950 is the page, 50 the text. */
const GRAY_STEPS: Array<[number, number]> = [
  [950, 0], [900, 0.06], [800, 0.13], [700, 0.21], [600, 0.34], [500, 0.5], [400, 0.64], [300, 0.77], [200, 0.88], [100, 0.95], [50, 1],
]

/** Every colour variable the components read, for one theme. */
export function themeVariables(t: ThemePalette): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [step, amount] of GRAY_STEPS) {
    // Cards are the theme's own tile colour, so a light theme gets white cards.
    vars[`--color-gray-${step}`] = step === 900 ? t.tile : mix(t.bg, t.ink, amount)
  }
  vars['--color-brand-300'] = t.accLight
  vars['--color-brand-400'] = t.acc
  vars['--color-brand-500'] = t.hero
  vars['--color-brand-600'] = mix(t.hero, '#000000', 0.14)
  vars['--color-brand-700'] = mix(t.hero, '#000000', 0.3)
  vars['--hms-accent'] = t.acc
  vars['--hms-glow'] = t.hero + (t.dark ? '22' : '33')
  vars['--hms-line'] = t.ink + (t.dark ? '1c' : '30')
  return vars
}

/** The whole of `src/styles/themes.css`. */
export function themesCss(): string {
  const blocks = THEMES.map((t) => {
    const lines = Object.entries(themeVariables(t)).map(([k, v]) => `  ${k}: ${v};`)
    return `:root[data-theme='${t.id}'] {\n  color-scheme: ${t.dark ? 'dark' : 'light'};\n${lines.join('\n')}\n}\n`
  })
  return `/* Written by \`npm run themes\` from src/features/theme/palettes.ts. Do not edit by hand. */\n\n${blocks.join('\n')}`
}
