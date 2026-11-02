import { useState, useRef, useEffect } from 'react'
import { copyText } from '@/lib/utils/copy-text'

interface SessionIdDisplayProps {
  sessionId: string
  interactive?: boolean
}

export function SessionIdDisplay({ sessionId, interactive = true }: SessionIdDisplayProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  async function handleCopy() {
    try {
      if (await copyText(`claude --resume ${sessionId}`)) {
        setCopied(true)
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // Nothing could copy: it stays as it was.
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-gray-600">
      <span>{sessionId}</span>
      {interactive && (
        <button
          type="button"
          onClick={handleCopy}
          className="rounded px-1 py-0.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
          title="Copy resume command"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      )}
    </span>
  )
}
