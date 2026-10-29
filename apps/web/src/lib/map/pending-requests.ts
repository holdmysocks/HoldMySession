import * as fs from 'node:fs'
import * as readline from 'node:readline'

/** An AskUserQuestion call that has no matching tool_result yet. */
export interface PendingQuestion {
  toolUseId: string
  timestamp: string
  questions: { header: string; question: string }[]
}

const QUESTION_TOOL_NAME = 'AskUserQuestion'

interface RawBlock {
  type?: string
  id?: string
  name?: string
  input?: { questions?: unknown }
  tool_use_id?: string
}

interface RawLine {
  type?: string
  timestamp?: string
  message?: { content?: unknown }
}

/**
 * Collect AskUserQuestion calls and their answers from one parsed JSONL line.
 * Mutates `asked` and `answered`; exported so the streaming scan can be tested
 * without touching the filesystem.
 */
export function collectQuestionBlocks(
  line: RawLine,
  asked: Map<string, PendingQuestion>,
  answered: Set<string>,
): void {
  const content = line?.message?.content
  if (!Array.isArray(content)) return

  for (const block of content as RawBlock[]) {
    if (block?.type === 'tool_use' && block.name === QUESTION_TOOL_NAME && block.id) {
      asked.set(block.id, {
        toolUseId: block.id,
        timestamp: line.timestamp ?? '',
        questions: normalizeQuestions(block.input?.questions),
      })
    } else if (block?.type === 'tool_result' && block.tool_use_id) {
      answered.add(block.tool_use_id)
    }
  }
}

function normalizeQuestions(raw: unknown): PendingQuestion['questions'] {
  if (!Array.isArray(raw)) return []
  return raw.map((q) => {
    const item = (q ?? {}) as { header?: unknown; question?: unknown }
    return {
      header: typeof item.header === 'string' ? item.header : '',
      question: typeof item.question === 'string' ? item.question : '',
    }
  })
}

/**
 * Find AskUserQuestion calls in a session JSONL that were never answered.
 *
 * Streams the file line by line, so large sessions do not load into memory.
 * Malformed lines are skipped. Returns questions oldest first.
 *
 * Note: an unanswered question can also mean the session was abandoned, so
 * callers should weigh it together with whether the session is still active.
 */
export async function findPendingQuestions(filePath: string): Promise<PendingQuestion[]> {
  const asked = new Map<string, PendingQuestion>()
  const answered = new Set<string>()

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!line.includes(QUESTION_TOOL_NAME) && !line.includes('tool_result')) continue
    let parsed: RawLine
    try {
      parsed = JSON.parse(line) as RawLine
    } catch {
      continue
    }
    collectQuestionBlocks(parsed, asked, answered)
  }

  return [...asked.values()]
    .filter((q) => !answered.has(q.toolUseId))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}
