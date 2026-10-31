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

/** The rest of each theme's colours: hairlines, chips, heatmap cells, and the chart lines. */
interface ThemeExtras {
  sub: string
  glow: string
  glowStrong: string
  line: string
  rule: string
  track: string
  chipBg: string
  chipInk: string
  cell: string
  l1: string
  l2: string
  l3: string
  l4: string
}

const EXTRAS: Record<string, ThemeExtras> = {
  dusk: { sub: '#C9C7BE', glow: '#D9775722', glowStrong: '#D9775799', line: '#ffffff1c', rule: '#ffffff14', track: '#ffffff12', chipBg: '#2D3B2A', chipInk: '#8FD39B', cell: '#2B2927', l1: '#FFA683', l2: '#A3CBF2', l3: '#B4D18F', l4: '#E4E2D8' },
  ink: { sub: '#C9C7BE', glow: '#D9775718', glowStrong: '#D9775799', line: '#ffffff1c', rule: '#ffffff14', track: '#ffffff12', chipBg: '#1F3320', chipInk: '#8FD39B', cell: '#1F1E1D', l1: '#FFA683', l2: '#A3CBF2', l3: '#B4D18F', l4: '#E4E2D8' },
  dracula: { sub: '#D7DAEA', glow: '#BD93F926', glowStrong: '#BD93F999', line: '#ffffff1f', rule: '#ffffff14', track: '#ffffff14', chipBg: '#1E3A2B', chipInk: '#50FA7B', cell: '#343746', l1: '#FF9AD5', l2: '#8BE9FD', l3: '#50FA7B', l4: '#F8F8F2' },
  nord: { sub: '#D8DEE9', glow: '#88C0D01f', glowStrong: '#88C0D099', line: '#ffffff1f', rule: '#ffffff14', track: '#ffffff14', chipBg: '#3B4B3F', chipInk: '#A3BE8C', cell: '#3B4252', l1: '#D08770', l2: '#88C0D0', l3: '#A3BE8C', l4: '#E5E9F0' },
  clay: { sub: '#3D3D3A', glow: '#D9775733', glowStrong: '#D9775766', line: '#14141330', rule: '#14141418', track: '#14141412', chipBg: '#DDEBD2', chipInk: '#25602F', cell: '#E2DFD2', l1: '#B4492A', l2: '#2F6FB0', l3: '#4F6B35', l4: '#6B6A63' },
  sage: { sub: '#2F3A2A', glow: '#788C5D33', glowStrong: '#788C5D77', line: '#1B211830', rule: '#1B211818', track: '#1B211812', chipBg: '#D3E3C4', chipInk: '#25602F', cell: '#D3DACB', l1: '#9A4A2E', l2: '#2F6FB0', l3: '#4F6B35', l4: '#5E6558' },
  alucard: { sub: '#3A3840', glow: '#644AC922', glowStrong: '#644AC966', line: '#1F1F1F30', rule: '#1F1F1F18', track: '#1F1F1F12', chipBg: '#DCEFD8', chipInk: '#14710A', cell: '#F0EAD2', l1: '#A3144D', l2: '#036A96', l3: '#14710A', l4: '#5C5963' },
  solar: { sub: '#2F4A52', glow: '#268BD22a', glowStrong: '#268BD266', line: '#07364230', rule: '#07364218', track: '#07364212', chipBg: '#E6EAC5', chipInk: '#5C6B00', cell: '#EEE8D5', l1: '#CB4B16', l2: '#268BD2', l3: '#6B7E00', l4: '#586E75' },
}

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
  vars['--hms-mute'] = t.mute
  vars['--hms-ink'] = t.ink
  vars['--hms-bg'] = t.bg
  const x = EXTRAS[t.id] ?? EXTRAS.dusk
  vars['--hms-glow'] = x.glow
  vars['--hms-glow-strong'] = x.glowStrong
  vars['--hms-line'] = x.line
  vars['--hms-rule'] = x.rule
  vars['--hms-track'] = x.track
  vars['--hms-sub'] = x.sub
  vars['--hms-chip-bg'] = x.chipBg
  vars['--hms-chip-ink'] = x.chipInk
  vars['--hms-cell'] = x.cell
  vars['--hms-l1'] = x.l1
  vars['--hms-l2'] = x.l2
  vars['--hms-l3'] = x.l3
  vars['--hms-l4'] = x.l4
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
