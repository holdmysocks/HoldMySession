import type { Severity } from '@/lib/usage/limits'

/** Yellow from 75% and red from 90%, in every theme. Under 75% the meter is the theme's own accent. */
export const SEVERITY_TEXT: Record<Severity, string> = { ok: 'text-brand-400', warn: 'text-amber-400', danger: 'text-red-400' }
