/**
 * Turns a failed connection into something a person can act on. Node's `fetch` reports the real
 * reason in `error.cause.code`, and a timeout as a TimeoutError or AbortError.
 */
export function explainConnectionError(error: unknown, address: string): string {
  const e = error as { name?: string; code?: string; cause?: { code?: string } } | null
  const code = e?.cause?.code ?? e?.code ?? ''
  if (code === 'ECONNREFUSED') {
    return `${address} refused the connection. HoldMySession there is either not running, or not listening on the network. On the master, turn on Listen on the network in Settings, Linked machines, and restart it.`
  }
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return `${address} did not answer. This is usually the master's firewall. On the master, open Settings, Linked machines, and use Allow through the firewall. It can also mean the two machines are not on the same network or tailnet.`
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `${address} was not found. Use the master's IP address instead of its name, or check the name.`
  }
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return `${address} cannot be reached from this machine. Check that both are on the same network or tailnet.`
  }
  return `Could not reach ${address}.`
}
