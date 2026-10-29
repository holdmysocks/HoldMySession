import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  collectQuestionBlocks,
  findPendingQuestions,
  type PendingQuestion,
} from './pending-requests'

function assistantAsk(id: string, timestamp: string, header = 'Scope', question = 'Which scope?') {
  return {
    type: 'assistant',
    timestamp,
    message: {
      content: [
        {
          type: 'tool_use',
          id,
          name: 'AskUserQuestion',
          input: { questions: [{ header, question }] },
        },
      ],
    },
  }
}

function userResult(toolUseId: string, timestamp: string) {
  return {
    type: 'user',
    timestamp,
    message: {
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'answered' }],
    },
  }
}

describe('collectQuestionBlocks', () => {
  it('records an AskUserQuestion tool_use with its questions', () => {
    const asked = new Map<string, PendingQuestion>()
    const answered = new Set<string>()
    collectQuestionBlocks(assistantAsk('t1', '2026-01-01T10:00:00Z'), asked, answered)

    expect(asked.get('t1')).toEqual({
      toolUseId: 't1',
      timestamp: '2026-01-01T10:00:00Z',
      questions: [{ header: 'Scope', question: 'Which scope?' }],
    })
  })

  it('records tool_result ids as answered', () => {
    const asked = new Map<string, PendingQuestion>()
    const answered = new Set<string>()
    collectQuestionBlocks(userResult('t1', '2026-01-01T10:01:00Z'), asked, answered)
    expect(answered.has('t1')).toBe(true)
  })

  it('ignores other tool names', () => {
    const asked = new Map<string, PendingQuestion>()
    collectQuestionBlocks(
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name: 'Bash', input: {} }] } },
      asked,
      new Set(),
    )
    expect(asked.size).toBe(0)
  })

  it('tolerates string content, missing content and a null line', () => {
    const asked = new Map<string, PendingQuestion>()
    const answered = new Set<string>()
    expect(() => collectQuestionBlocks({ type: 'user', message: { content: 'hi' } }, asked, answered)).not.toThrow()
    expect(() => collectQuestionBlocks({ type: 'user' }, asked, answered)).not.toThrow()
    expect(() => collectQuestionBlocks(null as never, asked, answered)).not.toThrow()
    expect(asked.size).toBe(0)
    expect(answered.size).toBe(0)
  })

  it('normalises malformed question entries to empty strings', () => {
    const asked = new Map<string, PendingQuestion>()
    collectQuestionBlocks(
      {
        type: 'assistant',
        timestamp: 't',
        message: {
          content: [{ type: 'tool_use', id: 'q', name: 'AskUserQuestion', input: { questions: [null, { header: 3 }] } }],
        },
      },
      asked,
      new Set(),
    )
    expect(asked.get('q')?.questions).toEqual([
      { header: '', question: '' },
      { header: '', question: '' },
    ])
  })
})

describe('findPendingQuestions', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pending-requests-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function writeSession(lines: unknown[] | string[]): string {
    const file = path.join(dir, 'session.jsonl')
    const text = lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n')
    fs.writeFileSync(file, text + '\n')
    return file
  }

  it('returns an empty list when the file has no questions', async () => {
    const file = writeSession([{ type: 'user', timestamp: 't1', message: { content: 'hello' } }])
    expect(await findPendingQuestions(file)).toEqual([])
  })

  it('returns questions that have no matching tool_result', async () => {
    const file = writeSession([
      assistantAsk('open', '2026-01-01T10:00:00Z', 'Stack', 'Which stack?'),
    ])
    const pending = await findPendingQuestions(file)
    expect(pending).toHaveLength(1)
    expect(pending[0].toolUseId).toBe('open')
    expect(pending[0].questions).toEqual([{ header: 'Stack', question: 'Which stack?' }])
  })

  it('drops questions that were answered', async () => {
    const file = writeSession([
      assistantAsk('done', '2026-01-01T10:00:00Z'),
      userResult('done', '2026-01-01T10:01:00Z'),
      assistantAsk('open', '2026-01-01T10:02:00Z'),
    ])
    const pending = await findPendingQuestions(file)
    expect(pending.map((q) => q.toolUseId)).toEqual(['open'])
  })

  it('returns questions oldest first', async () => {
    const file = writeSession([
      assistantAsk('later', '2026-01-01T12:00:00Z'),
      assistantAsk('earlier', '2026-01-01T09:00:00Z'),
    ])
    const pending = await findPendingQuestions(file)
    expect(pending.map((q) => q.toolUseId)).toEqual(['earlier', 'later'])
  })

  it('skips malformed JSON lines without failing', async () => {
    const file = writeSession([
      '{"type":"assistant", "message": AskUserQuestion broken',
      assistantAsk('ok', '2026-01-01T10:00:00Z'),
      '',
      'AskUserQuestion not json at all',
    ])
    const pending = await findPendingQuestions(file)
    expect(pending.map((q) => q.toolUseId)).toEqual(['ok'])
  })

  it('handles CRLF line endings', async () => {
    const file = path.join(dir, 'crlf.jsonl')
    const body = [JSON.stringify(assistantAsk('crlf', '2026-01-01T10:00:00Z'))].join('\r\n') + '\r\n'
    fs.writeFileSync(file, body)
    const pending = await findPendingQuestions(file)
    expect(pending.map((q) => q.toolUseId)).toEqual(['crlf'])
  })
})
