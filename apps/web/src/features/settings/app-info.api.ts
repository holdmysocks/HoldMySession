import { createServerFn } from '@tanstack/react-start'
import { getClaudeDir } from '@/lib/utils/claude-path'
import { readVersionFromPackageJson } from '@/lib/app-version'

export interface AppInfo {
  version: string
  appPath: string
  nodeEnv: string
}

export const getAppInfo = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AppInfo> => {
    return {
      version: readVersionFromPackageJson(),
      appPath: getClaudeDir(),
      nodeEnv: process.env.NODE_ENV ?? 'development',
    }
  },
)
