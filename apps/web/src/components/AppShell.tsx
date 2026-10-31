import { Link, useMatches } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ActiveSessionsBadge } from '@/features/sessions/ActiveSessionsBadge'
import { appInfoQuery } from '@/features/settings/app-info.queries'
import { useHistoryRefresh } from '@/features/history/useHistoryRefresh'
import { MachineFilter } from '@/features/link/MachineFilter'
import { ProjectFilter } from '@/features/project-analytics/ProjectFilter'
import { updateInfoQuery } from '@/features/updates/updates.queries'

/** The three pages in the menu. Settings is the gear. */
const NAV_ITEMS = [
  { to: '/stats', label: 'Stats' },
  { to: '/map', label: 'Map' },
  { to: '/sessions', label: 'Sessions' },
] as const

const REPO_URL = 'https://github.com/holdmysocks/HoldMySession'

/** The spark: eight strokes from one point. */
function Spark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" />
      </g>
    </svg>
  )
}

/** A solid cog: a disc with eight teeth and a hole. The mask keeps it a single colour that follows the text. */
function Gear({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <mask id="hms-gear-mask">
          <rect width="24" height="24" fill="#000" />
          <g fill="#fff">
            <circle cx="12" cy="12" r="7" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
              <rect key={angle} x="10" y="1.5" width="4" height="5" rx="1" transform={`rotate(${angle} 12 12)`} />
            ))}
          </g>
          <circle cx="12" cy="12" r="3" fill="#000" />
        </mask>
      </defs>
      <rect width="24" height="24" fill="currentColor" mask="url(#hms-gear-mask)" />
    </svg>
  )
}

/** The menu: a hairline pill, with the open page outlined in the accent. */
function NavPill({ currentPath, className }: { currentPath: string; className?: string }) {
  return (
    <nav aria-label="Main" className={`flex gap-1 rounded-full border border-gray-700 p-1 ${className ?? ''}`}>
      {NAV_ITEMS.map((item) => {
        const active = currentPath.startsWith(item.to)
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full border-[1.5px] px-[18px] text-sm font-medium transition-colors md:flex-none ${
              active ? 'border-brand-400 text-brand-400' : 'border-transparent text-gray-300 hover:text-gray-100'
            }`}
          >
            {item.label}
            {item.to === '/sessions' && <ActiveSessionsBadge />}
          </Link>
        )
      })}
    </nav>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const matches = useMatches()
  const currentPath = matches[matches.length - 1]?.pathname ?? ''
  const wide = currentPath.startsWith('/map')
  const { data: appInfo } = useQuery(appInfoQuery)
  const { data: update } = useQuery(updateInfoQuery)
  useHistoryRefresh()
  const onSettings = currentPath.startsWith('/settings')
  const updateReady = !!update?.available && !!update.latest

  // The map fills the width it is given. Every other page keeps a readable column.
  const column = wide ? 'px-4 sm:px-6' : 'mx-auto w-full max-w-[1228px] px-4 sm:px-6'

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundImage: 'radial-gradient(900px 420px at 18% -8%, var(--hms-glow), transparent)', backgroundRepeat: 'no-repeat' }}
    >
      <header className={`${column} pt-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/stats" className="flex items-center gap-2.5 text-gray-100" title="Go to Stats">
            <Spark className="h-7 w-7 text-brand-500 drop-shadow-[0_0_8px_var(--hms-glow)]" />
            <span className="font-display text-[19px] font-bold">HoldMySession</span>
          </Link>

          <NavPill currentPath={currentPath} className="hidden md:flex" />

          <div className="flex items-center gap-2">
            {/* Drawn only on a master with linked nodes. It chooses whose data every page shows. */}
            {currentPath.startsWith('/stats') && <ProjectFilter />}
            <MachineFilter />
            <Link
              to="/settings"
              aria-label="Settings"
              aria-current={onSettings ? 'page' : undefined}
              title={updateReady ? `Settings (v${update?.latest} is available)` : 'Settings'}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
                onSettings ? 'border-[1.5px] border-brand-400 text-brand-400' : 'border-gray-700 text-gray-100 hover:border-gray-500'
              }`}
            >
              <Gear className="h-[22px] w-[22px]" />
              {updateReady && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-brand-400 ring-2 ring-gray-950" />}
            </Link>
          </div>
        </div>
      </header>

      <main className={`${column} min-w-0 flex-1 pb-28 pt-10 md:pb-12 md:pt-14`}>{children}</main>

      <footer className={`${column} hidden pb-6 text-xs text-gray-500 md:block`}>
        <div className="flex items-center justify-between gap-3 border-t border-gray-800 pt-4">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-gray-300" title="GitHub repository">
            GitHub
          </a>
          {appInfo && (
            <span className="flex items-center gap-2">
              {updateReady && (
                <a
                  href={update?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-brand-500/20 px-2 py-0.5 font-medium text-brand-300 hover:bg-brand-500/30"
                  title="A newer version is available"
                >
                  v{update?.latest} available
                </a>
              )}
              <a
                href={update?.url ?? `${REPO_URL}/releases`}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-gray-300"
                title={`Releases · reading sessions from ${appInfo.appPath}`}
              >
                v{appInfo.version}
              </a>
            </span>
          )}
        </div>
      </footer>

      {/* On a phone the menu floats at the bottom, where a thumb reaches it. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 md:hidden">
        <div className="h-8 bg-gradient-to-t from-gray-950 to-transparent" />
        <div className="pointer-events-auto bg-gray-950 px-4 pb-4">
          <NavPill currentPath={currentPath} className="bg-gray-950/95" />
        </div>
      </div>
    </div>
  )
}
