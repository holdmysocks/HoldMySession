import type { AgentInvocation, SessionSummary, TokenUsage } from '../parsers/types'
import { describeWaiting, type NotificationInfo, type WaitingInfo } from './waiting'
import type { PendingQuestion } from './pending-requests'
import { deriveSessionStatus, SUBAGENT_CACHE_WINDOW_MS } from '../status/session-status'
import type { SessionStatus } from '../status/session-status'

/**
 * Pure model for the project map. One node per session in the project, arranged as a
 * tree: a fork is a child of the session it was forked from, and each subagent is a child
 * of the session (or fork) that dispatched it. No filesystem access here, so it is
 * unit-testable.
 *
 * Only running subagents become nodes. An expired subagent (see SUBAGENT_CACHE_WINDOW_MS)
 * is not a node. It is counted on its session node instead, so it takes no layout space.
 */

export type MapNodeKind = 'session' | 'subagent'

/** How a session is linked to the session it hangs under. */
export type ParentRelation = 'fork' | 'sub-session'

/** The parent of one session, and how it is linked. */
export interface ParentLink {
  parentSessionId: string
  relation: ParentRelation
}

/**
 * Session nodes use the shared session status. Subagent nodes are always 'running', because
 * expired subagents are not added to the map.
 */
export type MapNodeStatus = SessionStatus | 'running'

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
  /** Session nodes only: background tasks still running. 0 for subagents. */
  backgroundTaskCount: number
  /**
   * Session nodes only: how this session is linked to its parent. 'fork' when the transcript says
   * it was forked. 'sub-session' when the desktop app nested it under its parent. Null when top level.
   */
  parentRelation: ParentRelation | null
  status: MapNodeStatus
  /** True when the session status is needs-you. */
  needsYou: boolean
  /**
   * Session nodes only: subagents this session dispatched whose cache has expired. They are
   * not drawn, and the map shows this count as a chip instead. 0 for subagent nodes.
   */
  expiredSubagentCount: number
  model: string | null
  tokens: number
  durationMs: number | null
  toolCalls: number | null
  timestamp: string | null
  pendingQuestions: PendingQuestion[]
  /** For a session that needs the user: what it is waiting for. Null otherwise. */
  waiting: WaitingInfo | null
  /** Session nodes: subagents working now (the ones drawn under it). 0 for subagent nodes. */
  runningAgents: number
  /** Session nodes: the session itself has been quiet for a while, so it is waiting on its agents rather than working beside them. */
  waitingOnAgents: boolean
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
  /** Time (epoch ms) of the last record per subagent agentId, from the subagent transcript files. */
  subagentLastActivity: ReadonlyMap<string, number>
  pendingQuestions: PendingQuestion[]
  /** Latest Notification hook event for this session, ISO timestamp, or null. */
  lastNotificationAt: string | null
  /** What that Notification said, so a waiting session can say what it waits for. */
  notification?: NotificationInfo | null
  /** Session-level total tokens across input, output and cache. */
  totalTokens: number
  /** Background tasks of this session that are still running. 0 when none. */
  backgroundTaskCount?: number
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

/** A session whose own transcript has not been written for this long, and has agents working, is waiting on them. */
const PARENT_QUIET_MS = 2 * 60_000

/** Session status for one map input. The pending question and notification come from the server. */
export function sessionStatus(input: MapSessionInput, nowMs: number): SessionStatus {
  return deriveSessionStatus(
    {
      // A session with agents still working is not done, even when its own transcript has gone quiet.
      isActive: input.summary.isActive || input.agents.length - expiredSubagentCount(input, nowMs) > 0,
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
 * A fork whose parent is missing is not linked. A session split in the desktop app
 * (`lineageDetached`) is not linked, even though its transcript still names the parent.
 * A cycle (possible only in a damaged file) is cut so that the tree stays a tree.
 */
export function forkParents(sessions: MapSessionInput[]): Map<string, ParentLink> {
  const ids = new Set(sessions.map((s) => s.summary.sessionId))
  const parentOf = new Map<string, ParentLink>()

  for (const { summary } of sessions) {
    if (summary.lineageDetached) continue
    // A transcript's forkedFrom says where it was forked from. Without one, use the desktop app's nesting.
    const forkedFrom = summary.forkedFrom?.sessionId
    const parent = forkedFrom ?? summary.desktopParentId ?? null
    const relation: ParentRelation = forkedFrom ? 'fork' : 'sub-session'
    if (parent && parent !== summary.sessionId && ids.has(parent)) {
      parentOf.set(summary.sessionId, { parentSessionId: parent, relation })
    }
  }

  for (const start of [...parentOf.keys()]) {
    const seen = new Set<string>([start])
    let current = parentOf.get(start)?.parentSessionId
    while (current !== undefined) {
      if (seen.has(current)) {
        parentOf.delete(start)
        break
      }
      seen.add(current)
      current = parentOf.get(current)?.parentSessionId
    }
  }

  return parentOf
}

function sessionSubtitle(summary: SessionSummary): string {
  return `${summary.sessionId.slice(0, 8)} · ${summary.messageCount} msgs`
}

function sessionNode(
  input: MapSessionInput,
  parentId: string | null,
  relation: ParentRelation | null,
  nowMs: number,
  expiredSubagentCount: number,
  runningAgents: number,
): MapNode {
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
    parentRelation: relation,
    backgroundTaskCount: input.backgroundTaskCount ?? 0,
    status,
    needsYou: status === 'needs-you',
    expiredSubagentCount,
    model: summary.model,
    tokens: input.totalTokens,
    durationMs: summary.durationMs,
    toolCalls: summary.toolCallCount,
    timestamp: summary.lastActiveAt,
    pendingQuestions: input.pendingQuestions,
    waiting:
      status === 'needs-you'
        ? describeWaiting({ question: input.pendingQuestions[0]?.questions[0]?.question, notification: input.notification })
        : null,
    runningAgents,
    waitingOnAgents: runningAgents > 0 && nowMs - Date.parse(summary.lastActiveAt) > PARENT_QUIET_MS,
  }
}

/**
 * A subagent is running when its transcript's last record is inside SUBAGENT_CACHE_WINDOW_MS.
 * No transcript (no agentId, or the file is gone) means it cannot be shown as running.
 */
export function isSubagentRunning(writtenAt: number | undefined, nowMs: number): boolean {
  return writtenAt !== undefined && nowMs - writtenAt <= SUBAGENT_CACHE_WINDOW_MS
}

function subagentWriteTime(input: MapSessionInput, agent: AgentInvocation): number | undefined {
  return agent.agentId ? input.subagentLastActivity.get(agent.agentId) : undefined
}

/** How many of this session's subagents have expired and so are not drawn. */
export function expiredSubagentCount(input: MapSessionInput, nowMs: number): number {
  return input.agents.filter((agent) => !isSubagentRunning(subagentWriteTime(input, agent), nowMs))
    .length
}

function subagentNode(sessionId: string, agent: AgentInvocation, index: number): MapNode {
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
    parentRelation: null,
    backgroundTaskCount: 0,
    status: 'running',
    needsYou: false,
    expiredSubagentCount: 0,
    model: agent.model ?? null,
    tokens: agent.totalTokens ?? tokenTotal(agent.tokens),
    durationMs: agent.durationMs ?? null,
    toolCalls: agent.totalToolUseCount ?? null,
    timestamp: agent.timestamp,
    pendingQuestions: [],
    waiting: null,
    runningAgents: 0,
    waitingOnAgents: false,
  }
}

/**
 * Build the map for one project. Input order is kept: pass sessions newest first, and
 * agents in the order they were dispatched. Every session in the input becomes a node.
 * Expired subagents are left out and counted on their session node.
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
    const link = parentOf.get(sid)
    const parentId = link ? `session:${link.parentSessionId}` : null
    const node = sessionNode(input, parentId, link?.relation ?? null, nowMs, expiredSubagentCount(input, nowMs), input.agents.length - expiredSubagentCount(input, nowMs))
    nodes.push(node)
    if (parentId) {
      edges.push({ id: `edge:${node.id}`, from: parentId, to: node.id, kind: 'fork' })
    }
  }

  for (const input of sessions) {
    const sid = input.summary.sessionId
    const parent = `session:${sid}`
    input.agents.forEach((agent, index) => {
      if (!isSubagentRunning(subagentWriteTime(input, agent), nowMs)) return
      const child = subagentNode(sid, agent, index)
      nodes.push(child)
      edges.push({ id: `edge:${child.id}`, from: parent, to: child.id, kind: 'dispatch' })
    })
  }

  return { projectKey, projectPath, projectDisplayName, nodes, edges }
}
