import { createServerFn } from '@tanstack/react-start'
import { ProjectsSchema, type ProjectsSetting } from '@/features/settings/settings.types'

export interface ListedProject {
  projectPath: string
  displayName: string
  sessionCount: number
  lastActiveAt: string
}

export interface MachineProjects {
  machineId: string
  name: string
  isSelf: boolean
  projects: ListedProject[]
}

/** Folds sessions into one entry per project, newest first. Scratch folders are the scratch setting's business, so they are left out. */
export function listProjects(
  sessions: Array<{ projectPath: string; projectDisplayName: string; projectName: string; cwd: string | null; lastActiveAt: string }>,
  isScratch: (s: { cwd: string | null; projectName: string; projectDisplayName: string }) => boolean,
): ListedProject[] {
  const byPath = new Map<string, ListedProject>()
  for (const s of sessions) {
    if (isScratch(s) || !s.cwd?.trim()) continue
    const existing = byPath.get(s.projectPath)
    if (existing) {
      existing.sessionCount += 1
      if (s.lastActiveAt > existing.lastActiveAt) existing.lastActiveAt = s.lastActiveAt
    } else {
      byPath.set(s.projectPath, {
        projectPath: s.projectPath,
        displayName: s.projectDisplayName || s.projectName,
        sessionCount: 1,
        lastActiveAt: s.lastActiveAt,
      })
    }
  }
  return [...byPath.values()].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
}

/** Every project found on this computer and on each linked machine, for hiding. */
export const getMachineProjects = createServerFn({ method: 'GET' }).handler(async (): Promise<MachineProjects[]> => {
  const { scanAllSessions } = await import('@/lib/scanner/session-scanner')
  const { isUnlinkedSession } = await import('@/lib/projects/unlinked')
  const { openHistoryDb } = await import('@/lib/history/history-db')
  const { listMachines, selfMachineId } = await import('@/lib/link/machines')
  const { remoteSessions } = await import('@/lib/link/scope')
  const local = await scanAllSessions()
  const db = openHistoryDb()
  try {
    const selfId = selfMachineId(db)
    const remote = remoteSessions(db)
    const machines = listMachines(db)
    const result: MachineProjects[] = [
      { machineId: selfId, name: machines.find((m) => m.isSelf)?.name ?? 'This computer', isSelf: true, projects: listProjects(local, isUnlinkedSession) },
    ]
    for (const m of machines.filter((m) => !m.isSelf)) {
      result.push({
        machineId: m.machineId,
        name: m.name,
        isSelf: false,
        projects: listProjects(remote.filter((s) => s.machineId === m.machineId), isUnlinkedSession),
      })
    }
    return result
  } finally {
    db.close()
  }
})

export const saveProjectPrefs = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => ProjectsSchema.parse(input))
  .handler(async ({ data }): Promise<ProjectsSetting> => {
    const { readSettingsFile, writeSettingsFile } = await import('@/lib/settings-file')
    return writeSettingsFile({ ...readSettingsFile(), projects: data }).projects
  })
