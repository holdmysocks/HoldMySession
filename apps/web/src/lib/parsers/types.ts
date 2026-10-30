import { z } from 'zod'

// --- Session summary (derived from first/last N lines of JSONL) ---

export interface SessionSummary {
  sessionId: string
  projectPath: string
  projectName: string
  branch: string | null
  cwd: string | null
  startedAt: string
  lastActiveAt: string
  durationMs: number
  messageCount: number
  userMessageCount: number
  assistantMessageCount: number
  isActive: boolean
  toolCallCount: number
  model: string | null
  version: string | null
  fileSizeBytes: number
  /** Total output tokens from assistant messages (lightweight streaming parse) */
  outputTokens?: number
  /**
   * `outputTokens` without any request an earlier-started session file already holds, so a fork's
   * copy of its parent's history is not counted twice. Set on each scan. The project totals use it.
   */
  uniqueOutputTokens?: number
  /** Which DataSource this came from, e.g. 'primary', 'wsl-ubuntu-user' */
  sourceId?: string
  /** Display label for the source, e.g. 'Windows', 'WSL - Ubuntu' */
  sourceLabel?: string
  /** Platform of the DataSource this came from */
  sourcePlatform?: 'windows' | 'wsl' | 'macos' | 'linux'
  /** Human name for the project: package.json name, git remote repo name, or folder name. */
  projectDisplayName: string
  /** Name the user gave the session (`custom-title`), else the summary title, else the first user message. */
  sessionName: string | null
  /** `stop_reason` of the last assistant message in the file tail, or null. */
  lastStopReason: string | null
  /** Directory name under ~/.claude/projects. An internal key: never decoded into a path. */
  projectKey: string
  /** Parent session this one was forked from (from `forkedFrom` in its first records), or null. */
  forkedFrom: ForkedFrom | null
  /** Archived in the Claude desktop app. From the app's session record, so absent without one. */
  isArchived?: boolean
  /**
   * An older transcript of a desktop session whose record now points at a newer one (its
   * `priorCliSessionIds`). It is a former version, not a session, so it is hidden everywhere.
   */
  isSuperseded?: boolean
  /** The desktop app's ID for the session this transcript belongs to, or null when it has no record. */
  desktopRecordId?: string | null
  /**
   * Split from its parent in the Claude desktop app (`lineageDetached`). The map draws no parent
   * link for it, even though its transcript still names the parent.
   */
  lineageDetached?: boolean
  /**
   * When the Claude desktop app last saw activity in this session (ISO time), or null. The map
   * orders sessions by it, falling back to `lastActiveAt`.
   */
  desktopActivityAt?: string | null
  /**
   * Parent session, from the desktop app's `spawnedFrom`, when the transcript has no `forkedFrom`.
   * The map draws it as a child link, like a fork. Null when not nested.
   */
  desktopParentId?: string | null
}

export interface ForkedFrom {
  sessionId: string
  messageUuid: string | null
}

// --- Session detail (full streaming parse) ---

export interface Turn {
  uuid: string
  type: 'user' | 'assistant' | 'system' | 'progress'
  timestamp: string
  message?: string
  model?: string
  toolCalls: ToolCall[]
  tokens?: TokenUsage
  stopReason?: string
}

export interface ToolCall {
  toolName: string
  toolUseId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw JSONL tool input has arbitrary shape
  input?: Record<string, any>
}

export interface TokenUsage {
  inputTokens: number
  /** Everything the model generated, reasoning included. This is what is billed as output. */
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  /**
   * The part of `outputTokens` the model spent on internal reasoning, from the transcripts'
   * `output_tokens_details.thinking_tokens`. Absent when the source does not record it.
   */
  thinkingTokens?: number
}

export interface AgentInvocation {
  subagentType: string
  description: string
  timestamp: string
  toolUseId: string
  tokens?: TokenUsage
  totalTokens?: number
  totalToolUseCount?: number
  durationMs?: number
  model?: string
  toolCalls?: Record<string, number>
  agentId?: string
  skills?: SkillInvocation[]
}

export interface SkillInvocation {
  skill: string
  args: string | null
  timestamp: string
  toolUseId: string
  /** How the skill was loaded: 'injected' = from agent frontmatter via <command-name>, 'invoked' = explicit Skill tool call */
  source?: 'injected' | 'invoked'
}

export interface TaskItem {
  taskId: string
  subject: string
  description?: string
  activeForm?: string
  status: 'pending' | 'in_progress' | 'completed' | 'deleted'
  timestamp: string
}

export interface ContextWindowSnapshot {
  turnIndex: number
  timestamp: string
  contextSize: number
  outputTokens: number
}

export interface ContextWindowData {
  contextLimit: number
  modelName: string
  systemOverhead: number
  currentContextSize: number
  messagesEstimate: number
  freeSpace: number
  autocompactBuffer: number
  usagePercent: number
  snapshots: ContextWindowSnapshot[]
}

export interface SessionDetail {
  sessionId: string
  projectPath: string
  projectName: string
  branch: string | null
  sessionName: string | null
  turns: Turn[]
  totalTokens: TokenUsage
  tokensByModel: Record<string, TokenUsage>
  toolFrequency: Record<string, number>
  errors: SessionError[]
  models: string[]
  agents: AgentInvocation[]
  skills: SkillInvocation[]
  tasks: TaskItem[]
  contextWindow: ContextWindowData | null
}

export interface SessionError {
  timestamp: string
  message: string
  type: string
}

// --- Stats cache (from ~/.claude/stats-cache.json) ---

export const DailyActivitySchema = z.object({
  date: z.string(),
  messageCount: z.number(),
  sessionCount: z.number(),
  toolCallCount: z.number(),
})

export const DailyModelTokensSchema = z.object({
  date: z.string(),
  tokensByModel: z.record(z.string(), z.number()),
})

export const ModelUsageSchema = z.record(
  z.string(),
  z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadInputTokens: z.number(),
    cacheCreationInputTokens: z.number(),
    thinkingTokens: z.number().optional(),
    webSearchRequests: z.number().optional(),
    costUSD: z.number().optional(),
  }),
)

export const LongestSessionSchema = z.object({
  sessionId: z.string(),
  duration: z.number(),
  messageCount: z.number(),
  timestamp: z.string(),
})

export const StatsCacheSchema = z.object({
  version: z.number(),
  lastComputedDate: z.string(),
  dailyActivity: z.array(DailyActivitySchema),
  dailyModelTokens: z.array(DailyModelTokensSchema),
  modelUsage: ModelUsageSchema,
  totalSessions: z.number(),
  totalMessages: z.number(),
  longestSession: LongestSessionSchema,
  firstSessionDate: z.string(),
  hourCounts: z.record(z.string(), z.number()),
  totalSpeculationTimeSavedMs: z.number().optional(),
})

export type StatsCache = z.infer<typeof StatsCacheSchema>
export type DailyActivity = z.infer<typeof DailyActivitySchema>
export type DailyModelTokens = z.infer<typeof DailyModelTokensSchema>
export type ModelUsage = z.infer<typeof ModelUsageSchema>

// --- History (from ~/.claude/history.jsonl) ---

export interface HistoryEntry {
  display: string
  timestamp: number
  project: string
  sessionId: string
}

// --- JSONL message types (raw file format) ---

/**
 * Raw JSONL message from Claude Code session files.
 *
 * Format changes by version:
 * - <= 2.1.63: Agent dispatch via "Task" tool, progress messages with agent data
 * - >= 2.1.68: Agent dispatch via "Agent" tool, NO progress messages for agents,
 *              subagent JSONL files are the only source of agent token/tool data.
 *              agentId still appears in tool_result text and toolUseResult.
 */
export interface RawJsonlMessage {
  type: 'user' | 'assistant' | 'system' | 'progress' | 'file-history-snapshot' | 'summary' | 'custom-title'
  uuid?: string
  parentUuid?: string
  sessionId?: string
  timestamp?: string
  cwd?: string
  gitBranch?: string
  version?: string
  /** Session title line written by Claude Code (`type: 'summary'`). */
  summary?: unknown
  /** Name set with /rename or --name (`type: 'custom-title'`). The newest one wins. */
  customTitle?: unknown
  /** Set on every record copied into a fork: the parent session and the original message. */
  forkedFrom?: { sessionId?: unknown; messageUuid?: unknown }
  /** Set on user lines Claude Code writes for itself (e.g. the caveat before a command). */
  isMeta?: boolean
  message?: {
    /** The API's own ID for the message. Shared by every record a streamed response is written as. */
    id?: string
    model?: string
    role?: string
    content?: Array<{
      type: string
      text?: string
      name?: string
      id?: string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw JSONL content has arbitrary shape
      input?: Record<string, any>
      // tool_result fields
      tool_use_id?: string
      content?: string | Array<{ type: string; text?: string }>
    }>
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
      output_tokens_details?: { thinking_tokens?: number }
    }
    stop_reason?: string
  }
  data?: {
    type?: string
    agentId?: string
    message?: {
      type?: string
      message?: {
        id?: string
        model?: string
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw JSONL content has arbitrary shape
        content?: Array<{ type: string; name?: string; id?: string; input?: Record<string, any> }>
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
          output_tokens_details?: { thinking_tokens?: number }
        }
      }
    }
  }
  requestId?: string
  parentToolUseID?: string
  toolUseResult?: {
    totalTokens?: number
    totalToolUseCount?: number
    totalDurationMs?: number
    agentId?: string
    isAsync?: boolean
    status?: string
    retrieval_status?: string
    task?: {
      task_id?: string
      status?: string
    }
  }
  slug?: string
  subtype?: string
  level?: string
}
