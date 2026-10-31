/** Series colours for the top models, then the grey used for the rest. They hold on every theme. */
export const MODEL_COLORS = ['var(--color-brand-400)', '#8f8cf0', '#4fb8a8'] as const
export const OTHER_COLOR = 'var(--color-gray-500)'
export const TOP_MODELS = 3

export function modelColor(index: number, isOther: boolean): string {
  return isOther ? OTHER_COLOR : MODEL_COLORS[index % MODEL_COLORS.length]
}
