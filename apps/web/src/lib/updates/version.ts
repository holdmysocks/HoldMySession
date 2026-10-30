/** The numbers of a version such as "0.6.0" or "v1.2.3-beta.1", or null if it is not one. A suffix after a dash is ignored. */
export function parseVersion(text: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(text.trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** Negative if `a` is older than `b`, positive if newer, 0 if the same. Versions that cannot be read count as the same. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) return 0
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}
