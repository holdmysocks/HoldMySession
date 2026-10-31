/** An on/off switch, the same one the other settings use. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-[30px] w-[52px] shrink-0 border-[1.5px] cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'border-brand-400 bg-brand-400/20' : 'border-[color:var(--hms-line)]'}`}
    >
      <span className={`inline-block h-[21px] w-[21px] rounded-full transition-transform ${on ? 'translate-x-[26px] bg-brand-400' : 'translate-x-[3px] bg-gray-400'}`} />
    </button>
  )
}
