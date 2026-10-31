import { format } from 'date-fns'
import { clockPattern, setClockFormat, type ClockFormat } from '@/lib/utils/time-format'
import { useClockFormat } from './ClockFormatProvider'

const OPTIONS: Array<{ id: ClockFormat; label: string }> = [
  { id: '24h', label: '24-hour' },
  { id: '12h', label: '12-hour' },
]

export function ClockFormatSetting() {
  const current = useClockFormat()
  const example = format(new Date(2026, 0, 1, 14, 30), clockPattern('HH:mm', current))
  return (
    <section aria-label="Time format" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]">
      <div>
        <h2 className="text-base font-semibold">Time format</h2>
        <p className="text-[13px] text-[color:var(--hms-mute)]">
          Show times of day on a 12-hour or 24-hour clock. Saved in this browser. <span className="font-mono">{example}</span>
        </p>
      </div>
      <div role="radiogroup" aria-label="Time format" className="flex rounded-full border border-[color:var(--hms-line)] p-1">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={current === o.id}
            onClick={() => setClockFormat(o.id)}
            className={`min-h-10 rounded-full border-[1.5px] px-4 text-sm font-medium transition-colors ${
              current === o.id ? 'border-brand-400 text-brand-400' : 'border-transparent text-[color:var(--hms-mute)] hover:text-gray-100'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  )
}
