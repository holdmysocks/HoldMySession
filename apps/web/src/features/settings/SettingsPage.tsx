import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { settingsQuery, useSettingsMutation } from './settings.queries'
import {
  DEFAULT_SETTINGS,
  type Settings,
  type ModelPricingOverride,
} from './settings.types'
import { PricingTableEditor } from './PricingTableEditor'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { ThemePicker } from '@/features/theme/ThemePicker'
import { HistoryPanel } from '@/features/history/HistoryPanel'
import { BackupPanel } from '@/features/history/BackupPanel'
import { LinkPanel } from '@/features/link/LinkPanel'
import { HooksPanel } from '@/features/hooks/HooksPanel'
import { DesktopPanel } from '@/features/desktop/DesktopPanel'
import { ProjectsPanel } from '@/features/projects/ProjectsPanel'
import { UpdatesPanel } from '@/features/updates/UpdatesPanel'
import { LinkedNote } from '@/features/link/LinkedNote'
import { ClockFormatSetting } from '@/features/time/ClockFormatSetting'
import { PriceHistoryPanel } from '@/features/history/PriceHistoryPanel'
import { SubscriptionPanel } from '@/features/history/SubscriptionPanel'

export const SETTINGS_TABS = ['general', 'projects', 'data', 'machines', 'claude', 'pricing', 'updates'] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

export function SettingsPage({ tab, onTab }: { tab: SettingsTab; onTab: (tab: SettingsTab) => void }) {
  const { data: settings, isLoading } = useQuery(settingsQuery)

  if (isLoading || !settings) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-800" />
        <div className="h-64 animate-pulse rounded-xl bg-gray-900/50" />
      </div>
    )
  }

  return <SettingsForm settings={settings} tab={tab} onTab={onTab} />
}

function SettingsForm({ settings, tab, onTab }: { settings: Settings; tab: SettingsTab; onTab: (tab: SettingsTab) => void }) {
  const mutation = useSettingsMutation()
  const { privacyMode, togglePrivacyMode } = usePrivacy()

  const [overrides, setOverrides] = useState<Record<string, ModelPricingOverride>>(settings.pricingOverrides)
  const [isDirty, setIsDirty] = useState(false)

  function handleOverridesChange(newOverrides: Record<string, ModelPricingOverride>) {
    setOverrides(newOverrides)
    setIsDirty(true)
  }

  function handleReset() {
    setOverrides(DEFAULT_SETTINGS.pricingOverrides)
    setIsDirty(true)
  }

  function handleSave() {
    // Everything else is kept as it is. The plan is kept as dated periods in the history database now.
    const updated: Settings = { ...settings, pricingOverrides: overrides, dataSources: [] }
    mutation.mutate(updated, {
      onSuccess: () => {
        setIsDirty(false)
      },
    })
  }

  const tabs: Array<{ id: SettingsTab; label: string; content: ReactNode }> = [
    {
      id: 'general',
      label: 'General',
      content: (
        <>
      {/* Privacy Mode */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-300">Privacy Mode</h2>
        <p className="mt-1 text-[10px] text-gray-500">
          Hide project names, file paths, and branch names across the dashboard.
          Useful when screen-sharing or recording demos.
        </p>
        <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">Enable privacy mode</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {privacyMode ? 'On' : 'Off'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={privacyMode}
                onClick={togglePrivacyMode}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                  privacyMode ? 'bg-brand-600' : 'bg-gray-800'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    privacyMode ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
          </div>
          <div className="mt-3 border-t border-gray-800 pt-3">
            <p className="text-[10px] font-medium text-gray-400">
              What gets hidden:
            </p>
            <ul className="mt-1.5 space-y-1 text-[10px] text-gray-500">
              <li>
                <span className="text-gray-400">Project names</span>{' '}
                <span className="font-mono text-gray-600">
                  &rarr; project-1, project-2, ...
                </span>
              </li>
              <li>
                <span className="text-gray-400">File paths</span>{' '}
                <span className="font-mono text-gray-600">
                  &rarr; .../project-1
                </span>
              </li>
              <li>
                <span className="text-gray-400">Branch names</span>{' '}
                <span className="font-mono text-gray-600">
                  &rarr; branch-1, branch-2, ...
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

          <ClockFormatSetting />
          <DesktopPanel />
          <ThemePicker />
        </>
      ),
    },
    { id: 'projects', label: 'Projects', content: <div className="mt-6"><ProjectsPanel /></div> },
    {
      id: 'data',
      label: 'Data',
      content: (
        <>
          <HistoryPanel />
          <BackupPanel />
        </>
      ),
    },
    { id: 'machines', label: 'Machines', content: <LinkPanel /> },
    { id: 'claude', label: 'Claude Code', content: <HooksPanel /> },
    {
      id: 'pricing',
      label: 'Plan and pricing',
      content: (
        <>
          <SubscriptionPanel />
      {/* Pricing Table */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-gray-300">
          API Pricing (per million tokens)
        </h2>
        <p className="mt-1 text-[10px] text-gray-500">
          Default prices from Anthropic. Override any value to match your negotiated
          rates.
        </p>
        <LinkedNote what="price overrides" />
        <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <PricingTableEditor
            overrides={overrides}
            onChange={handleOverridesChange}
          />
        </div>
      </div>
          <PriceHistoryPanel />

      {/* Actions */}
      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-300"
        >
          Reset to Defaults
        </button>

        <div className="flex items-center gap-3">
          {mutation.isSuccess && !isDirty && (
            <span className="text-xs text-emerald-400">Saved</span>
          )}
          {mutation.isError && (
            <span className="text-xs text-red-400">
              Failed to save: {mutation.error?.message ?? 'Unknown error'}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || mutation.isPending}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
              isDirty && !mutation.isPending
                ? 'bg-brand-600 text-gray-100 hover:bg-brand-500'
                : 'cursor-not-allowed bg-gray-800 text-gray-500'
            }`}
          >
            {mutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
        </>
      ),
    },
    { id: 'updates', label: 'Updates', content: <UpdatesPanel /> },
  ]
  const active = tabs.find((t) => t.id === tab) ?? tabs[0]

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-100">Settings</h1>
      <div role="tablist" aria-label="Settings sections" className="mt-4 flex flex-wrap gap-1 border-b border-gray-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`settings-tab-${t.id}`}
            aria-selected={active.id === t.id}
            aria-controls="settings-panel"
            onClick={() => onTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs transition-colors ${
              active.id === t.id ? 'border-brand-500 text-gray-100' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${active.id}`}>
        {active.content}
      </div>
    </div>
  )
}
