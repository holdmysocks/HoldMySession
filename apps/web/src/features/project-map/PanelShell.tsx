import type { ReactNode } from 'react'

export function PanelShell({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{count}</span>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}
