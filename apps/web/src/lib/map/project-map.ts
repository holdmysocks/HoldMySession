import type { AgentInvocation, SessionSummary, TokenUsage } from '../parsers/types'
import type { PendingQuestion } from './pending-requests'
import { deriveSessionStatus } from '../status/session-status'
import type { SessionStatus } from '../status/session-status'

/**
 * Pure model for the project map. One node per session in the project, arranged as a
 * tree: a fork is a child of the session it was forked from, and each subagent is a child
 * of the session (or fork) that dispatched it. No filesystem access here, so it is
 * unit-testable.
 */

export type MapNodeKind = 'session' | 'subagent'

/**
 * Session nodes use the shared session status. Subagent nodes are 'running' while their
 * transcript was written in the last SUBAGENT_RUNNING_WINDOW_MS, otherwise 'done'.
 */
export type MapNodeStatus = SessionStatus | 'running' | 'done'

/** A subagent transcript written this recently counts as running. Same window as the active detector. */
export const SUBAGENT_RUNNING_WINDOW_MS = 2 * 60_000

export interface MapNode {
  id: string
  kind: MapNodeKind
  /** Owning session id. For session nodes this is the node's own session. */
  sessionId: string
  /** Parent node id (a session, for forks and subagents), or null for top-level sessions. */
  parentId: string | null
  /** Session nodes: the session name. Subagent nodes: the subagent type. */
  title: string
  /** Subagent nodes: the dispatch description. Session nodes: short id and message count. */
  subtitle: string
  /** Session nodes only: git branch, shown on its own line so privacy mode can mask it. */
  branch: string | null
  /** Session nodes only. The project's display name, shown as the node's primary label. */
  projectDisplayName: string | null
  /** Session nodes only: true when this session is a fork of another session in the project. */
  isFork: boolean
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
  /** 'fork' joins a session to a session forked from it. 'dispatch' joins a session to a subagent. */
  kind: 'fork' | 'dispatch'
}

export interface ProjectMap {
  /** Directory name under ~/.claude/projects. Used to address the project. */
  projectKey: string
  /** Working directory, as recorded in the transcripts. */
  projectPath: string
  projectDisplayName: string
  nodes: MapNode[]
  edges: MapEdge[]
}

/** Everything the builder needs about one session. The server fills this in. */
export interface MapSessionInput {
  summary: SessionSummary
  agents: AgentInvocation[]
  /** Last write time (epoch ms) per subagent agentId, from the subagent transcript files. */
  subagentWriteTimes: ReadonlyMap<string, number>
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

/**
 * Parent session of each fork, for sessions whose parent is in the same project.
 * A fork whose parent is missing is not linked. A cycle (possible only in a damaged file)
 * is cut so that the tree stays a tree.
 */
export function forkParents(sessions: MapSessionInput[]): Map<string, string> {
  const ids = new Set(sessions.map((s) => s.summary.sessionId))
  const parentOf = new Map<string, string>()

  for (const { summary } of sessions) {
    const parent = summary.forkedFrom?.sessionId
    if (parent && parent !== summary.sessionId && ids.has(parent)) {
      parentOf.set(summary.sessionId, parent)
    }
  }

  for (const start of [...parentOf.keys()]) {
    const seen = new Set<string>([start])
    let current = parentOf.get(start)
    while (current !== undefined) {
      if (seen.has(current)) {
        parentOf.delete(start)
        break
      }
      seen.add(current)
      current = parentOf.get(current)
    }
  }

  return parentOf
}

function sessionSubtitle(summary: SessionSummary): string {
  return `${summary.sessionId.slice(0, 8)} · ${summary.messageCount} msgs`
}

function sessionNode(input: MapSessionInput, parentId: string | null, nowMs: number): MapNode {
  const { summary } = input
  const status = sessionStatus(input, nowMs)
  return {
    id: `session:${summary.sessionId}`,
    kind: 'session',
    sessionId: summary.sessionId,
    parentId,
    title: summary.sessionName ?? 'Untitled session',
    subtitle: sessionSubtitle(summary),
    branch: summary.branch,
    projectDisplayName: summary.projectDisplayName,
    isFork: parentId !== null,
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

function subagentStatus(writtenAt: number | undefined, nowMs: number): MapNodeStatus {
  if (writtenAt !== undefined && nowMs - writtenAt <= SUBAGENT_RUNNING_WINDOW_MS) return 'running'
  return 'done'
}

function subagentNode(
  sessionId: string,
  agent: AgentInvocation,
  index: number,
  writtenAt: number | undefined,
  nowMs: number,
): MapNode {
  const key = agent.agentId ?? agent.toolUseId ?? String(index)
  return {
    id: `agent:${sessionId}:${key}`,
    kind: 'subagent',
    sessionId,
    parentId: `session:${sessionId}`,
    title: agent.subagentType || 'agent',
    subtitle: agent.description,
    branch: null,
    projectDisplayName: null,
    isFork: false,
    status: subagentStatus(writtenAt, nowMs),
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
 * Build the map for one project. Input order is kept: pass sessions newest first, and
 * agents in the order they were dispatched. Every session in the input becomes a node.
 */
export function buildProjectMap(
  projectKey: string,
  projectPath: string,
  projectDisplayName: string,
  sessions: MapSessionInput[],
  nowMs: number = Date.now(),
): ProjectMap {
  const parentOf = forkParents(sessions)
  const nodes: MapNode[] = []
  const edges: MapEdge[] = []

  for (const input of sessions) {
    const sid = input.summary.sessionId
    const parentSid = parentOf.get(sid)
    const parentId = parentSid ? `session:${parentSid}` : null
    const node = sessionNode(input, parentId, nowMs)
    nodes.push(node)
    if (parentId) {
      edges.push({ id: `edge:${node.id}`, from: parentId, to: node.id, kind: 'fork' })
    }
  }

  for (const input of sessions) {
    const sid = input.summary.sessionId
    const parent = `session:${sid}`
    input.agents.forEach((agent, index) => {
      const writtenAt = agent.agentId ? input.subagentWriteTimes.get(agent.agentId) : undefined
      const child = subagentNode(sid, agent, index, writtenAt, nowMs)
      nodes.push(child)
      edges.push({ id: `edge:${child.id}`, from: parent, to: child.id, kind: 'dispatch' })
    })
  }

  return { projectKey, projectPath, projectDisplayName, nodes, edges }
}
