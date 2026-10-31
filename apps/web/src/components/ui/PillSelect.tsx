import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export interface SelectOption {
  value: string
  label: string
}
export interface SelectGroup {
  group: string
  options: SelectOption[]
}
export type SelectItem = SelectOption | SelectGroup

const isGroup = (item: SelectItem): item is SelectGroup => 'group' in item

/**
 * A dropdown drawn in the theme, in place of the browser's own list, which ignores the theme and can show
 * light text on a white page. A pill shows the chosen option, and the list opens under it. Arrow keys,
 * Enter, Escape and a click outside work as they do on a native select.
 */
export function PillSelect({
  value,
  onChange,
  options,
  label,
  className = '',
  disabled,
  align = 'left',
  accent,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectItem[]
  /** What the control is for, for screen readers. */
  label: string
  className?: string
  disabled?: boolean
  align?: 'left' | 'right'
  /** Outline the pill in the accent, for a choice that is narrowing the page. */
  accent?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()

  const flat = useMemo(() => options.flatMap((o) => (isGroup(o) ? o.options : [o])), [options])
  const selected = flat.find((o) => o.value === value) ?? flat[0]

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function show() {
    if (disabled) return
    setActive(Math.max(0, flat.findIndex((o) => o.value === selected?.value)))
    setOpen(true)
  }

  function choose(v: string) {
    setOpen(false)
    if (v !== value) onChange(v)
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        show()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(flat.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(flat.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (flat[active]) choose(flat[active].value)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const renderOption = (o: SelectOption) => {
    const i = flat.indexOf(o)
    const on = o.value === selected?.value
    return (
      <li
        key={o.value}
        id={`${listId}-${i}`}
        role="option"
        aria-selected={on}
        onMouseEnter={() => setActive(i)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => choose(o.value)}
        className={`flex min-h-10 cursor-pointer items-center rounded-xl px-3.5 text-sm ${
          i === active ? 'bg-[color:var(--hms-track)]' : ''
        } ${on ? 'font-semibold text-brand-400' : 'text-gray-100'}`}
      >
        <span className="truncate">{o.label}</span>
      </li>
    )
  }

  return (
    <div ref={root} className="relative inline-block">
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`flex min-h-11 items-center gap-2.5 rounded-full border bg-transparent pl-[18px] pr-4 text-left text-sm font-medium text-gray-100 outline-none transition-colors focus-visible:border-brand-400 disabled:cursor-not-allowed disabled:opacity-50 ${
          accent ? 'border-[1.5px] border-brand-400 font-semibold text-brand-400' : 'border-[color:var(--hms-line)] hover:border-gray-500'
        } ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? ''}</span>
        <span aria-hidden="true" className="text-[11px]">▾</span>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className={`absolute z-50 mt-2 max-h-72 min-w-full max-w-[320px] overflow-auto rounded-2xl border border-[color:var(--hms-line)] bg-gray-900 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {options.map((item) =>
            isGroup(item) ? (
              <li key={item.group} role="presentation">
                <div className="px-3.5 pb-1 pt-2 text-xs font-semibold text-brand-400">{item.group}</div>
                <ul role="group" aria-label={item.group}>
                  {item.options.map(renderOption)}
                </ul>
              </li>
            ) : (
              renderOption(item)
            ),
          )}
        </ul>
      )}
    </div>
  )
}
