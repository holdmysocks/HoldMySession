import { Link, useMatches } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore, type ReactNode } from 'react'
import { ActiveSessionsBadge } from '@/features/sessions/ActiveSessionsBadge'
import { appInfoQuery } from '@/features/settings/app-info.queries'
import { useHistoryRefresh } from '@/features/history/useHistoryRefresh'
import { MachineFilter } from '@/features/link/MachineFilter'
import { updateInfoQuery } from '@/features/updates/updates.queries'

const NAV_ITEMS = [
  {
    to: '/stats',
    label: 'Stats',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
        <rect x="1" y="8" width="3" height="7" rx="0.5" />
        <rect x="6.5" y="4" width="3" height="11" rx="0.5" />
        <rect x="12" y="1" width="3" height="14" rx="0.5" />
      </svg>
    ),
  },
  {
    to: '/map',
    label: 'Map',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4.6 4.2L11.4 3M4.6 4.6L11.4 12.6" />
        <circle cx="3" cy="4.5" r="1.8" fill="currentColor" />
        <circle cx="13" cy="2.8" r="1.8" fill="currentColor" />
        <circle cx="13" cy="12.8" r="1.8" fill="currentColor" />
      </svg>
    ),
  },
  {
    to: '/sessions',
    label: 'Sessions',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="2" y1="4" x2="14" y2="4" />
        <line x1="2" y1="8" x2="14" y2="8" />
        <line x1="2" y1="12" x2="14" y2="12" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" />
        <path fillRule="evenodd" clipRule="evenodd" d="M6.5.8a1 1 0 011-.8h1a1 1 0 011 .8l.15.9a5.5 5.5 0 011.1.64l.86-.36a1 1 0 011.17.36l.5.86a1 1 0 01-.18 1.17l-.7.55a5.5 5.5 0 010 1.27l.7.55a1 1 0 01.18 1.17l-.5.86a1 1 0 01-1.17.36l-.86-.36a5.5 5.5 0 01-1.1.64l-.14.9a1 1 0 01-1 .8h-1a1 1 0 01-1-.8l-.14-.9a5.5 5.5 0 01-1.1-.64l-.87.36a1 1 0 01-1.17-.36l-.5-.86a1 1 0 01.18-1.17l.7-.55a5.5 5.5 0 010-1.27l-.7-.55a1 1 0 01-.18-1.17l.5-.86a1 1 0 011.17-.36l.87.36a5.5 5.5 0 011.1-.64L6.5.8zM8 11a3 3 0 100-6 3 3 0 000 6z" />
      </svg>
    ),
  },
] as const

const COLLAPSE_KEY = 'sidebar-collapsed'
const COLLAPSE_EVENT = 'sidebar-collapsed-change'

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener(COLLAPSE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function toggleCollapsed() {
  try {
    localStorage.setItem(COLLAPSE_KEY, readCollapsed() ? '0' : '1')
  } catch {
    // Not remembered, which is fine.
  }
  window.dispatchEvent(new Event(COLLAPSE_EVENT))
}

export function AppShell({ children }: { children: ReactNode }) {
  const matches = useMatches()
  const currentPath = matches[matches.length - 1]?.pathname ?? ''
  const wide = currentPath.startsWith('/map')
  const { data: appInfo } = useQuery(appInfoQuery)
  const { data: update } = useQuery(updateInfoQuery)
  useHistoryRefresh()
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false)

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className={`sticky top-0 flex h-screen ${collapsed ? 'w-16' : 'w-60'} shrink-0 flex-col border-r border-gray-800 bg-gray-950`}>
        <div className={`flex h-16 items-center border-b border-gray-800 ${collapsed ? 'justify-center' : 'justify-between pl-4 pr-2'}`}>
          {!collapsed && (
            <Link to="/stats" className="text-lg font-bold text-gray-100" title="Go to Stats">
              HoldMy<span className="text-brand-500">Session</span>
            </Link>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-900 hover:text-gray-200"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
              <line x1="6" y1="2.5" x2="6" y2="13.5" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-3">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPath.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'} rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-800 text-gray-100'
                    : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                }`}
              >
                <span className="text-gray-500">
                  {item.icon}
                </span>
                {!collapsed && item.label}
                {!collapsed && item.to === '/sessions' && <ActiveSessionsBadge />}
              </Link>
            )
          })}
        </nav>

        {!collapsed && <div className="border-t border-gray-800 p-3">
          <div className="flex items-center justify-between gap-2">
            <a
              href="https://github.com/holdmysocks/HoldMySession"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 transition-colors"
              title="GitHub Repository"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
            {appInfo && (
              <div className="flex min-w-0 items-center gap-2 text-[10px] text-gray-500">
                {update?.available && update.latest && (
                  <a
                    href={update.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-brand-500/20 px-1.5 py-0.5 font-medium text-brand-600 hover:bg-brand-500/30"
                    title="A newer version is available"
                  >
                    v{update.latest} available
                  </a>
                )}
                <a
                  href={update?.url ?? 'https://github.com/holdmysocks/HoldMySession/releases'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-300"
                  title={`Releases · reading sessions from ${appInfo.appPath}`}
                >
                  v{appInfo.version}
                </a>
              </div>
            )}
          </div>
        </div>}
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1 overflow-auto">
        {/* The map fills the width it is given. Every other page keeps a readable column. */}
        <div className={wide ? 'px-6 py-6' : 'mx-auto max-w-5xl px-6 py-6'}>
          {/* Drawn only on a master with linked nodes. It chooses whose data every page shows. */}
          <MachineFilter />
          {children}
        </div>
      </main>
    </div>
  )
}
