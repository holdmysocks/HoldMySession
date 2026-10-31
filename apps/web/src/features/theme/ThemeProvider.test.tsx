import { describe, it, expect, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { ThemeProvider, useTheme } from './ThemeProvider'
import { ThemePicker } from './ThemePicker'
import { THEMES } from './palettes'

function Probe() {
  const { theme, isDark, setTheme } = useTheme()
  return (
    <div>
      <div data-testid="theme">{theme}</div>
      <div data-testid="dark">{String(isDark)}</div>
      <button data-testid="to-nord" onClick={() => setTheme('nord')}>Nord</button>
      <button data-testid="to-solar" onClick={() => setTheme('solar')}>Solar</button>
    </div>
  )
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  it('starts on Dusk when nothing was chosen, whatever the system prefers', () => {
    renderProbe()
    expect(screen.getByTestId('theme').textContent).toBe('dusk')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dusk')
    expect(screen.getByTestId('dark').textContent).toBe('true')
  })

  it('reads a saved theme', () => {
    localStorage.setItem('csd-theme', 'alucard')
    renderProbe()
    expect(screen.getByTestId('theme').textContent).toBe('alucard')
    expect(screen.getByTestId('dark').textContent).toBe('false')
  })

  it('carries over what older versions saved: dark is Dusk and light is Clay', () => {
    localStorage.setItem('csd-theme', 'dark')
    const first = renderProbe()
    expect(screen.getByTestId('theme').textContent).toBe('dusk')
    first.unmount()
    localStorage.setItem('csd-theme', 'light')
    renderProbe()
    expect(screen.getByTestId('theme').textContent).toBe('clay')
  })

  it('ignores a value that is not a theme', () => {
    localStorage.setItem('csd-theme', 'neon')
    renderProbe()
    expect(screen.getByTestId('theme').textContent).toBe('dusk')
  })

  it('applies a new theme to the page and remembers it', () => {
    renderProbe()
    act(() => screen.getByTestId('to-nord').click())
    expect(document.documentElement.getAttribute('data-theme')).toBe('nord')
    expect(localStorage.getItem('csd-theme')).toBe('nord')
    act(() => screen.getByTestId('to-solar').click())
    expect(screen.getByTestId('dark').textContent).toBe('false')
  })

  it('throws when used outside the provider', () => {
    expect(() => render(<Probe />)).toThrow('useTheme must be used within a ThemeProvider')
  })
})

describe('ThemePicker', () => {
  it('offers every theme and marks the chosen one', () => {
    localStorage.setItem('csd-theme', 'dracula')
    render(
      <ThemeProvider>
        <ThemePicker />
      </ThemeProvider>,
    )
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(THEMES.length)
    expect(screen.getByRole('radio', { name: /Dracula/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /Dusk/ }).getAttribute('aria-checked')).toBe('false')
  })

  it('changes the theme when a card is chosen', () => {
    render(
      <ThemeProvider>
        <ThemePicker />
      </ThemeProvider>,
    )
    act(() => screen.getByRole('radio', { name: /Sage/ }).click())
    expect(document.documentElement.getAttribute('data-theme')).toBe('sage')
  })
})
