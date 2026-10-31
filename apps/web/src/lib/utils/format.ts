import { formatDistanceToNow, format } from 'date-fns'
import { clockPattern } from '@/lib/utils/time-format'

export function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    const remainingMin = minutes % 60
    return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`
  }
  if (minutes > 0) {
    const remainingSec = seconds % 60
    return remainingSec > 0 ? `${minutes}m ${remainingSec}s` : `${minutes}m`
  }
  return `${seconds}s`
}

export function formatRelativeTime(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
}

export function formatDateTime(dateStr: string): string {
  return format(new Date(dateStr), clockPattern('MMM d, yyyy HH:mm'))
}

export function formatTokenCount(count: number): string {
  if (count >= 1_000_000_000) {
    return `${(count / 1_000_000_000).toFixed(1)}B`
  }
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`
  }
  return count.toString()
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  }
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${bytes} B`
}

export function formatUSD(amount: number): string {
  if (!Number.isFinite(amount)) return '$0.00'
  if (amount < 0.005) return '<$0.01'
  if (amount >= 100) return `$${Math.round(amount)}`
  return `$${amount.toFixed(2)}`
}

/** "now", "2 min ago", "1 h ago", "yesterday", "3 days ago": the short form the lists use. */
export function formatAgo(dateStr: string, nowMs: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((nowMs - new Date(dateStr).getTime()) / 60_000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return format(new Date(dateStr), 'MMM d, yyyy')
}
