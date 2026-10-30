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
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-300">Time format</h2>
      <p className="mt-1 text-[10px] text-gray-500">Show times of day on a 12-hour or 24-hour clock. Saved in this browser.</p>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/50 p-4">
        <span className="text-xs text-gray-300">
          Clock <span className="ml-2 font-mono text-gray-500">{example}</span>
        </span>
        <div role="radiogroup" aria-label="Time format" className="flex overflow-hidden rounded-lg border border-gray-800">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={current === o.id}
              onClick={() => setClockFormat(o.id)}
              className={`px-3 py-1 text-xs transition-colors ${
                current === o.id ? 'bg-brand-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
