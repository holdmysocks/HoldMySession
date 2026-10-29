import type { AgentInvocation, SessionSummary, TokenUsage } from '../parsers/types'
import type { PendingQuestion } from './pending-requests'

/**
 * Pure model for the project map: one node per interactive session, one child
 * node per subagent dispatched from that session, and a dispatch edge between
 * them. No filesystem access here, so it is unit-testable.
 */

export type MapNodeKind = 'session' | 'subagent'

/** Session nodes: 'active' (recently written) or 'idle'. Subagent nodes: 'done' or 'unknown'. */
export type MapNodeStatus = 'active' | 'idle' | 'done' | 'unknown'

export interface MapNode {
  id: string
  kind: MapNodeKind
  /** Owning session id. For session nodes this is the node's own session. */
  sessionId: string
  /** Parent node id, or null for session nodes. */
  parentId: string | null
  title: string
  subtitle: string
  status: MapNodeStatus
  /** True when the session is waiting on you: an open question, or a Notification after its last write. */
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
  projectName: string
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

export function sessionNeedsYou(input: MapSessionInput): boolean {
  if (input.pendingQuestions.length > 0) return true
  if (!input.lastNotificationAt) return false
  return Date.parse(input.lastNotificationAt) > Date.parse(input.summary.lastActiveAt)
}

/** Short, stable label for a session: branch if present, else the first 8 chars of its id. */
function sessionTitle(summary: SessionSummary): string {
  return summary.branch ?? summary.sessionId.slice(0, 8)
}

function sessionNode(input: MapSessionInput): MapNode {
  const { summary } = input
  return {
    id: `session:${summary.sessionId}`,
    kind: 'session',
    sessionId: summary.sessionId,
    parentId: null,
    title: sessionTitle(summary),
    subtitle: `${summary.sessionId.slice(0, 8)} · ${summary.messageCount} msgs`,
    status: summary.isActive ? 'active' : 'idle',
    needsYou: sessionNeedsYou(input),
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
  projectName: string,
  sessions: MapSessionInput[],
): ProjectMap {
  const nodes: MapNode[] = []
  const edges: MapEdge[] = []

  for (const input of sessions) {
    const parent = sessionNode(input)
    nodes.push(parent)

    input.agents.forEach((agent, index) => {
      const child = subagentNode(input.summary.sessionId, agent, index)
      nodes.push(child)
      edges.push({ id: `edge:${child.id}`, from: parent.id, to: child.id, kind: 'dispatch' })
    })
  }

  return { projectPath, projectName, nodes, edges }
}
