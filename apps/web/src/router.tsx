import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  // The server starts the automatic history scan. `import.meta.env.SSR` is false in the browser build, so none of this ships there.
  if (import.meta.env.SSR) {
    void import('@/lib/history/auto-scan').then((m) => m.startAutoScan())
    void import('@/lib/updates/auto-update').then((m) => m.startAutoUpdate())
  }

  const router = createRouter({
    routeTree,
    scrollRestoration: true,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
