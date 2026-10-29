import type { AgentInvocation, SessionSummary, TokenUsage } from '../parsers/types'
import type { PendingQuestion } from './pending-requests'
import { deriveSessionStatus } from '../status/session-status'
import type { SessionStatus } from '../status/session-status'

/**
 * Pure model for the project map: one node per session in the project, one child
 * node per subagent dispatched from that session, and a dispatch edge between
 * them. No filesystem access here, so it is unit-testable.
 */

export type MapNodeKind = 'session' | 'subagent'

/** Session nodes use the shared session status. Subagent nodes: 'done' or 'unknown'. */
export type MapNodeStatus = SessionStatus | 'done' | 'unknown'

export interface MapNode {
  id: string
  kind: MapNodeKind
  /** Owning session id. For session nodes this is the node's own session. */
  sessionId: string
  /** Parent node id, or null for session nodes. */
  parentId: string | null
  /** Session name for session nodes, agent type for subagent nodes. */
  title: string
  /** Session nodes: short id and message count. Subagent nodes: the dispatch description. */
  subtitle: string
  /** Session nodes only. Shown with the subtitle so privacy mode can hide it on the client. */
  projectDisplayName: string | null
  status: MapNodeStatus
  /** True when the session status is needs-you. */
  needsYou: boolean
  model: string | null
  tokens: number
  durationMs: number | null
  toolCalls: number | null
  timestamp: string | null
  pendingQuestions: PendingQuestion[]
}

export interface MapEdge {
  id: string
  from: string
  to: string
  kind: 'dispatch'
}

export interface ProjectMap {
  projectPath: string
  projectDisplayName: string
  nodes: MapNode[]
  edges: MapEdge[]
}

/** Everything the builder needs about one session. The server fills this in. */
export interface MapSessionInput {
  summary: SessionSummary
  agents: AgentInvocation[]
  pendingQuestions: PendingQuestion[]
  /** Latest Notification hook event for this session, ISO timestamp, or null. */
  lastNotificationAt: string | null
  /** Session-level total tokens across input, output and cache. */
  totalTokens: number
}

export function tokenTotal(usage: TokenUsage | undefined): number {
  if (!usage) return 0
  return (
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheReadInputTokens +
    usage.cacheCreationInputTokens
  )
}

/** Session status for one map input. The pending question and notification come from the server. */
export function sessionStatus(input: MapSessionInput, nowMs: number): SessionStatus {
  return deriveSessionStatus(
    {
      isActive: input.summary.isActive,
      lastActiveAt: input.summary.lastActiveAt,
      lastStopReason: input.summary.lastStopReason,
      lastNotificationAt: input.lastNotificationAt,
      hasOpenQuestion: input.pendingQuestions.length > 0,
    },
    nowMs,
  )
}

/** Session name, else the branch, else the first 8 chars of the id. Names can be long; the canvas cuts them. */
function sessionTitle(summary: SessionSummary): string {
  return summary.sessionName ?? summary.branch ?? summary.sessionId.slice(0, 8)
}

function sessionNode(input: MapSessionInput, nowMs: number): MapNode {
  const { summary } = input
  const status = sessionStatus(input, nowMs)
  return {
    id: `session:${summary.sessionId}`,
    kind: 'session',
    sessionId: summary.sessionId,
    parentId: null,
    title: sessionTitle(summary),
    subtitle: `${summary.sessionId.slice(0, 8)} · ${summary.messageCount} msgs`,
    projectDisplayName: summary.projectDisplayName,
    status,
    needsYou: status === 'needs-you',
    model: summary.model,
    tokens: input.totalTokens,
    durationMs: summary.durationMs,
    toolCalls: summary.toolCallCount,
    timestamp: summary.lastActiveAt,
    pendingQuestions: input.pendingQuestions,
  }
}

function subagentNode(sessionId: string, agent: AgentInvocation, index: number): MapNode {
  const key = agent.agentId ?? agent.toolUseId ?? String(index)
  const hasDuration = agent.durationMs !== undefined
  return {
    id: `agent:${sessionId}:${key}`,
    kind: 'subagent',
    sessionId,
    parentId: `session:${sessionId}`,
    title: agent.subagentType || 'agent',
    subtitle: agent.description,
    projectDisplayName: null,
    status: hasDuration ? 'done' : 'unknown',
    needsYou: false,
    model: agent.model ?? null,
    tokens: agent.totalTokens ?? tokenTotal(agent.tokens),
    durationMs: agent.durationMs ?? null,
    toolCalls: agent.totalToolUseCount ?? null,
    timestamp: agent.timestamp,
    pendingQuestions: [],
  }
}

/**
 * Build the map for one project. Input order is kept: pass sessions newest first,
 * and agents in the order they were dispatched.
 */
export function buildProjectMap(
  projectPath: string,
  projectDisplayName: string,
  sessions: MapSessionInput[],
  nowMs: number = Date.now(),
): ProjectMap {
  const nodes: MapNode[] = []
  const edges: MapEdge[] = []

  for (const input of sessions) {
    const parent = sessionNode(input, nowMs)
    nodes.push(parent)

    input.agents.forEach((agent, index) => {
      const child = subagentNode(input.summary.sessionId, agent, index)
      nodes.push(child)
      edges.push({ id: `edge:${child.id}`, from: parent.id, to: child.id, kind: 'dispatch' })
    })
  }

  return { projectPath, projectDisplayName, nodes, edges }
}
