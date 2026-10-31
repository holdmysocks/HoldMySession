import { THEMES } from './palettes'
import { useTheme } from './ThemeProvider'

/** The theme choices as cards, in rows of four: the dark themes first, then the light ones. The chosen card is outlined. */
export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  return (
    <section aria-label="Theme" className="mt-8 border-t border-[color:var(--hms-rule)] pt-8">
      <h2 className="font-display text-[22px] font-semibold">Theme</h2>
      <p className="mt-1 text-[15px] text-[color:var(--hms-mute)]">Dark is the default. Pick another and the whole app follows.</p>
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
              className={`rounded-[28px] p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                chosen ? 'border-2 border-brand-400' : 'border border-[color:var(--hms-line)] hover:border-gray-500'
              }`}
            >
              <span className="flex flex-col gap-2 rounded-[20px] p-3" style={{ background: t.bg }} aria-hidden="true">
                <span className="block h-11 rounded-[14px]" style={{ background: t.hero }} />
                <span className="flex gap-1.5">
                  <span className="block h-8 flex-1 rounded-[14px]" style={{ background: t.tile }} />
                  <span className="block h-8 flex-1 rounded-[14px]" style={{ background: t.tile }} />
                </span>
              </span>
              <span className="mt-3 flex items-center justify-between gap-2 px-1 text-base font-semibold text-gray-100">
                {t.label}
                <span className="text-xs font-normal text-[color:var(--hms-mute)]">{t.note}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
