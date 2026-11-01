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
import { updateInfoQuery } from '@/features/updates/updates.queries'
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
        <div className="h-64 animate-pulse rounded-2xl bg-gray-900" />
      </div>
    )
  }

  return <SettingsForm settings={settings} tab={tab} onTab={onTab} />
}

function SettingsForm({ settings, tab, onTab }: { settings: Settings; tab: SettingsTab; onTab: (tab: SettingsTab) => void }) {
  const mutation = useSettingsMutation()
  const { privacyMode, togglePrivacyMode } = usePrivacy()
  // The same dot as on the gear, so the tab to open is easy to find once Settings is up.
  const { data: update } = useQuery(updateInfoQuery)
  const updateReady = !!update?.available && !!update.latest

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
          <ClockFormatSetting />
          <section aria-label="Privacy mode" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]">
            <div>
              <h2 className="text-base font-semibold">Privacy mode</h2>
              <p className="text-[13px] text-[color:var(--hms-mute)]">
                Hide project names, paths and branches. Useful when sharing your screen.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={privacyMode}
              aria-label="Privacy mode"
              onClick={togglePrivacyMode}
              className={`relative inline-flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full border-[1.5px] transition-colors ${
                privacyMode ? 'border-brand-400 bg-brand-400/20' : 'border-[color:var(--hms-line)]'
              }`}
            >
              <span className={`inline-block h-[21px] w-[21px] rounded-full transition-transform ${privacyMode ? 'translate-x-[26px] bg-brand-400' : 'translate-x-[3px] bg-gray-400'}`} />
            </button>
          </section>
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
        <h2 className="font-display text-[22px] font-semibold">
          API pricing
        </h2>
        <p className="mt-1 text-[15px] text-[color:var(--hms-mute)]">
          Dollars per million tokens. Change any value to match your own rates.
        </p>
        <LinkedNote what="price overrides" />
        <div className="mt-3 border-b border-[color:var(--hms-rule)] py-4">
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
          className="min-h-11 rounded-full border border-[color:var(--hms-line)] px-[18px] text-sm font-medium text-gray-100 hover:border-gray-500"
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
            className={`min-h-11 rounded-full px-5 text-sm font-semibold transition-colors ${
              isDirty && !mutation.isPending
                ? 'bg-brand-400 text-gray-950 hover:bg-brand-300'
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
      <h1 className="m-0 font-display text-[40px] font-bold leading-[1.05] sm:text-[52px]">Settings</h1>
      <div role="tablist" aria-label="Settings sections" className="-mx-4 mt-7 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`settings-tab-${t.id}`}
            aria-selected={active.id === t.id}
            aria-controls="settings-panel"
            onClick={() => onTab(t.id)}
            className={`relative min-h-11 shrink-0 rounded-full border-[1.5px] px-[18px] text-[13.33px] font-medium transition-colors ${
              active.id === t.id ? 'border-brand-400 text-brand-400' : 'border-[color:var(--hms-line)] text-[color:var(--hms-mute)] hover:text-gray-100'
            }`}
          >
            {t.label}
            {t.id === 'updates' && updateReady && (
              <span
                role="img"
                aria-label={`Version ${update?.latest} is available`}
                title={`Version ${update?.latest} is available`}
                className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-brand-400 ring-2 ring-gray-950"
              />
            )}
          </button>
        ))}
      </div>
      <div className="mt-7" role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${active.id}`}>
        {active.content}
      </div>
    </div>
  )
}
