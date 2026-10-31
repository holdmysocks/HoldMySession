import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_THEME, paletteOf, themeFromStored, type ThemeId } from './palettes'

const THEME_STORAGE_KEY = 'csd-theme'

type ThemeContextValue = {
  theme: ThemeId
  /** The page is dark, as opposed to one of the light themes. */
  isDark: boolean
  setTheme: (theme: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getInitialTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME
  try {
    return themeFromStored(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

/** Puts the theme on <html data-theme>, which themes.css reads, and tints the browser's own chrome. */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute('data-theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', paletteOf(theme).bg)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Not remembered, which is fine.
    }
  }, [theme])

  const value = useMemo(() => ({ theme, isDark: paletteOf(theme).dark, setTheme }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}
