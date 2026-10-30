import { spawn, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { dataDir } from '@/lib/data-dir'

/**
 * Windows asks about its firewall only the first time a program listens on the network, and may not
 * ask at all (a policy, or the program was seen before), so the app adds the rule itself. The rule lets
 * in this machine's own network and the tailnet (Tailscale's 100.64.0.0/10) on any network profile, and
 * nobody else, because the dashboard has no login of its own. Adding a rule needs an administrator, so
 * Windows shows its own permission prompt. On a Mac the system asks by itself the first time.
 */
export const RULE_NAME = 'HoldMySession'
export const ALLOWED_REMOTE = 'LocalSubnet,100.64.0.0/10'

export type FirewallState = 'allowed' | 'missing' | 'not-needed'

/** The command that replaces the rule, run with administrator rights. Pure, so it can be checked. */
export function ruleCommand(port: number): string {
  const netsh = 'netsh advfirewall firewall'
  return (
    `${netsh} delete rule name=${RULE_NAME} & ` +
    `${netsh} add rule name=${RULE_NAME} dir=in action=allow protocol=TCP localport=${port} profile=any remoteip=${ALLOWED_REMOTE}`
  )
}

/** The PowerShell command that runs `ruleCommand` after Windows' permission prompt. */
export function elevatedPowerShell(port: number): string[] {
  const args = `/c ${ruleCommand(port)}`.replace(/'/g, "''")
  return ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Start-Process -FilePath cmd.exe -ArgumentList '${args}' -Verb RunAs -WindowStyle Hidden -Wait`]
}

export function firewallState(platform: NodeJS.Platform = process.platform): FirewallState {
  if (platform !== 'win32') return 'not-needed'
  try {
    const result = spawnSync('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${RULE_NAME}`], { windowsHide: true, timeout: 8_000 })
    // netsh exits 0 when the rule exists and 1 when nothing matches, in any language.
    return result.status === 0 ? 'allowed' : 'missing'
  } catch {
    return 'missing'
  }
}

/** Starts the permission prompt and returns at once. The caller watches `firewallState` for the result. */
export function requestFirewallRule(port: number, platform: NodeJS.Platform = process.platform): boolean {
  if (platform !== 'win32') return false
  try {
    const child = spawn('powershell.exe', elevatedPowerShell(port), { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    return true
  } catch {
    return false
  }
}

const declinedFile = () => path.join(dataDir(), 'firewall-declined')

/** Whether the user was already asked at start-up and did not allow it, so start-up does not ask again every time. */
export function wasDeclined(): boolean {
  return fs.existsSync(declinedFile())
}

export function markDeclined(declined: boolean): void {
  try {
    if (declined) {
      fs.mkdirSync(path.dirname(declinedFile()), { recursive: true })
      fs.writeFileSync(declinedFile(), new Date().toISOString())
    } else {
      fs.rmSync(declinedFile(), { force: true })
    }
  } catch {
    // Not remembered, which only means it may ask again.
  }
}

/**
 * At start-up on Windows, when the server listens on the network and there is no rule, asks once. If the
 * user does not allow it, that is remembered, and the button in Settings is still there.
 */
export async function ensureFirewallOnStart(port: number, listensOnNetwork: boolean): Promise<void> {
  if (process.platform !== 'win32' || !listensOnNetwork || wasDeclined() || firewallState() === 'allowed') return
  if (!requestFirewallRule(port)) return
  // Wait for the answer for a minute, polling, then record a refusal.
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2_000).unref?.())
    if (firewallState() === 'allowed') return
  }
  markDeclined(true)
}
