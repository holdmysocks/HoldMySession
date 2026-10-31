import { THEMES } from './palettes'
import { useTheme } from './ThemeProvider'

/** The theme choices as cards, in rows of four: the dark themes first, then the light ones. The chosen card is outlined. */
export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="mt-6 border-t border-gray-800 pt-6">
      <h2 className="text-sm font-semibold text-gray-300">Theme</h2>
      <p className="mt-1 text-[10px] text-gray-500">Dark is the default. Pick another and the whole app follows.</p>
      <div role="radiogroup" aria-label="Theme" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {THEMES.map((t) => {
          const chosen = theme === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => setTheme(t.id)}
              className={`rounded-2xl p-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                chosen ? 'border-2 border-brand-400' : 'border border-gray-800 hover:border-gray-700'
              }`}
            >
              <span className="flex flex-col gap-1.5 rounded-xl p-2" style={{ background: t.bg }} aria-hidden="true">
                <span className="block h-7 rounded-lg" style={{ background: t.hero }} />
                <span className="flex gap-1.5">
                  <span className="block h-4 flex-1 rounded-lg" style={{ background: t.tile }} />
                  <span className="block h-4 flex-1 rounded-lg" style={{ background: t.tile }} />
                </span>
              </span>
              <span className="mt-2 flex items-center justify-between gap-2 text-sm font-semibold text-gray-100">
                {t.label}
                <span className="text-[10px] font-normal text-gray-500">{t.note}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
