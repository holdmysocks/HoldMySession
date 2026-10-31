import { DEFAULT_PRICING, type ModelPricing, type ModelPricingOverride } from './settings.types'

interface PricingTableEditorProps {
  overrides: Record<string, ModelPricingOverride>
  onChange: (overrides: Record<string, ModelPricingOverride>) => void
}

const PRICE_FIELDS = [
  { key: 'inputPerMTok' as const, label: 'Input' },
  { key: 'outputPerMTok' as const, label: 'Output' },
  { key: 'cacheReadPerMTok' as const, label: 'Cache Read' },
  { key: 'cacheWritePerMTok' as const, label: 'Cache Write' },
]

export function PricingTableEditor({ overrides, onChange }: PricingTableEditorProps) {
  function handleCellChange(
    modelId: string,
    field: keyof ModelPricingOverride,
    rawValue: string,
  ) {
    const numValue = parseFloat(rawValue)
    if (!Number.isFinite(numValue) || numValue < 0 || numValue > 1_000_000) return

    const defaultModel = DEFAULT_PRICING.find((m) => m.modelId === modelId)
    if (!defaultModel) return

    // Build the current override for this model (start from existing or defaults)
    const currentOverride: ModelPricingOverride = overrides[modelId]
      ? { ...overrides[modelId] }
      : {
          inputPerMTok: defaultModel.inputPerMTok,
          outputPerMTok: defaultModel.outputPerMTok,
          cacheReadPerMTok: defaultModel.cacheReadPerMTok,
          cacheWritePerMTok: defaultModel.cacheWritePerMTok,
        }

    currentOverride[field] = numValue

    // Check if all values match defaults -- if so, remove the override
    const isDefault =
      currentOverride.inputPerMTok === defaultModel.inputPerMTok &&
      currentOverride.outputPerMTok === defaultModel.outputPerMTok &&
      currentOverride.cacheReadPerMTok === defaultModel.cacheReadPerMTok &&
      currentOverride.cacheWritePerMTok === defaultModel.cacheWritePerMTok

    const next = { ...overrides }
    if (isDefault) {
      delete next[modelId]
    } else {
      next[modelId] = currentOverride
    }

    onChange(next)
  }

  function getEffectiveValue(
    model: ModelPricing,
    field: keyof ModelPricingOverride,
  ): number {
    const override = overrides[model.modelId]
    return override ? override[field] : model[field]
  }

  function isOverridden(modelId: string, field: keyof ModelPricingOverride): boolean {
    const override = overrides[modelId]
    if (!override) return false
    const defaultModel = DEFAULT_PRICING.find((m) => m.modelId === modelId)
    if (!defaultModel) return false
    return override[field] !== defaultModel[field]
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[color:var(--hms-rule)] text-xs text-[color:var(--hms-mute)]">
            <th className="py-2.5 pr-4 font-normal">Model</th>
            {PRICE_FIELDS.map((f) => (
              <th key={f.key} className="px-2 py-2.5 text-right font-normal">
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DEFAULT_PRICING.map((model) => (
            <tr key={model.modelId} className="border-b border-[color:var(--hms-rule)]">
              <td className="py-3 pr-4 font-semibold">{model.displayName}</td>
              {PRICE_FIELDS.map((f) => {
                const value = getEffectiveValue(model, f.key)
                const changed = isOverridden(model.modelId, f.key)
                return (
                  <td key={f.key} className="px-1 py-1.5 text-right">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={value}
                      aria-label={`${model.displayName} ${f.label}`}
                      onChange={(e) => handleCellChange(model.modelId, f.key, e.target.value)}
                      className={`w-24 rounded-full border border-transparent bg-transparent px-2 py-1.5 text-right tabular-nums hover:border-[color:var(--hms-line)] focus:border-brand-400 focus:outline-none ${
                        changed ? 'font-semibold text-brand-400' : ''
                      }`}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-[color:var(--hms-mute)]">Overridden values are highlighted.</p>
    </div>
  )
}
