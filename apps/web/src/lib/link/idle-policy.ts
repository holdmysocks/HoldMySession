/**
 * The quit-when-idle choice of a machine, and how a master's choice for a node and the node's own are reconciled. Whichever was
 * changed last wins, so a toggle on the node is not undone by an old choice at the master, and the other way round. Pure.
 */
export interface IdleChoice {
  quit: boolean
  minutes: 10 | 30 | 60 | 120
  /** When this was last changed, as an ISO time. A choice with none is older than any that has one. */
  updatedAt?: string
}

const time = (c: { updatedAt?: string } | null | undefined): number => {
  const t = c?.updatedAt ? Date.parse(c.updatedAt) : NaN
  return Number.isNaN(t) ? -Infinity : t
}

const same = (a: IdleChoice, b: IdleChoice) => a.quit === b.quit && a.minutes === b.minutes

/** Whether a node should take the master's choice for it: the master's is newer, and different. */
export function shouldApplyPolicy(local: IdleChoice, policy: IdleChoice | null | undefined): boolean {
  if (!policy || !policy.updatedAt) return false
  return time(policy) > time(local) && !same(local, policy)
}

export interface NodeIdleView {
  quit: boolean
  minutes: 10 | 30 | 60 | 120
  /** The master has chosen something the node has not taken yet, such as one that is off or has quit. */
  pending: boolean
}

/**
 * What a master shows for a node: the node's own choice as it last reported it, or the master's if that was set after, in which
 * case it is pending until the node syncs. Null when the node has reported nothing and no choice was made, as with a node
 * that is not yet updated.
 */
export function nodeIdleView(reported: IdleChoice | null | undefined, policy: IdleChoice | null | undefined): NodeIdleView | null {
  if (policy && (!reported || time(policy) > time(reported))) {
    return { quit: policy.quit, minutes: policy.minutes, pending: !reported || !same(reported, policy) }
  }
  if (reported) return { quit: reported.quit, minutes: reported.minutes, pending: false }
  return null
}
