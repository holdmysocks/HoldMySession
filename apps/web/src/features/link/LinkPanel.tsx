import { useState } from 'react'
import { copyText } from '@/lib/utils/copy-text'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { clockPattern } from '@/lib/utils/time-format'
import { linkStateQuery, useLinkMutations } from './link.queries'
import type { LinkState, MachineSummary } from './link.api'

const input = 'min-h-11 rounded-full border border-[color:var(--hms-line)] bg-transparent px-4 text-sm text-gray-100 outline-none focus:border-brand-400'
const button =
  'min-h-11 rounded-full border border-[color:var(--hms-line)] bg-transparent px-[18px] text-sm font-medium text-gray-100 hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50'
const when = (iso: string | null) => (iso ? format(new Date(iso), clockPattern('MMM d, HH:mm')) : 'never')

const rowClass = 'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]'
const danger = "min-h-11 rounded-full border border-[#E5645455] bg-transparent px-[18px] text-sm font-medium text-[#E56454] hover:border-[#E56454] disabled:opacity-50"
const sectionTitle = 'mt-6 font-display text-[22px] font-semibold'

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full border-[1.5px] transition-colors ${on ? 'border-brand-400 bg-brand-400/20' : 'border-[color:var(--hms-line)]'}`}
    >
      <span className={`inline-block h-[21px] w-[21px] rounded-full transition-transform ${on ? 'translate-x-[26px] bg-brand-400' : 'translate-x-[3px] bg-gray-400'}`} />
    </button>
  )
}

export function LinkPanel() {
  const { data: state } = useQuery(linkStateQuery)
  const m = useLinkMutations()
  const [error, setError] = useState<string | null>(null)
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  if (!state) return null
  const isMaster = state.link.role === 'master'
  const self = state.machines.find((x) => x.isSelf)

  return (
    <div>
      <section aria-label="Role" className={rowClass}>
        <div>
          <h2 className="text-base font-semibold">This computer is a</h2>
          <p className="text-[13px] text-[color:var(--hms-mute)]">
            A master collects the others. A node sends its sessions to a master. Every install works on its own until you link it.
          </p>
          {self && (
            <div className="mt-1 text-[13px]">
              <NameField machine={self} canEdit onSave={(name) => m.rename.mutate({ data: { machineId: self.machineId, name } }, { onError: fail })} />
            </div>
          )}
        </div>
        <div role="radiogroup" aria-label="Role of this machine" className="flex rounded-full border border-[color:var(--hms-line)] p-1">
          {(['master', 'node'] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={state.link.role === r}
              disabled={m.role.isPending}
              onClick={() => state.link.role !== r && m.role.mutate({ data: { role: r } }, { onError: fail })}
              className={`min-h-10 rounded-full border-[1.5px] px-[18px] text-[13.33px] font-medium transition-colors ${
                state.link.role === r ? 'border-brand-400 text-brand-400' : 'border-transparent text-[color:var(--hms-mute)] hover:text-gray-100'
              }`}
            >
              {r === 'node' ? 'Node' : 'Master'}
            </button>
          ))}
        </div>
      </section>

      {isMaster ? <MasterSection state={state} m={m} fail={fail} /> : <NodeSection state={state} m={m} fail={fail} />}

      {state.machines.length > 1 || isMaster ? (
        <section aria-label="Linked machines">
          <h2 className={sectionTitle}>Linked machines</h2>
          {state.machines.map((x) => (
            <div key={x.machineId} className={rowClass}>
              <div className="min-w-0">
                <span className="font-semibold">{x.name}</span>
                <span className="ml-2.5 text-xs" style={{ color: x.isSelf || x.lastSeenAt ? 'var(--hms-chip-ink)' : 'var(--hms-mute)' }}>
                  ● {x.isSelf ? 'this machine' : 'linked'}
                </span>
                <div className="text-[13px] text-[color:var(--hms-mute)]">
                  {[x.appVersion ? `v${x.appVersion}` : null, `${x.sessions} sessions`, !x.isSelf ? `last seen ${when(x.lastSeenAt)}` : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex gap-2">
                {(isMaster || x.isSelf) && (
                  <NameField
                    machine={x}
                    canEdit
                    asButton
                    onSave={(name) => m.rename.mutate({ data: { machineId: x.machineId, name } }, { onError: fail })}
                  />
                )}
                {isMaster && !x.isSelf && (
                  <button
                    type="button"
                    className={danger}
                    onClick={() =>
                      window.confirm(`Remove ${x.name} and delete its ${x.sessions} sessions from this history?\n\nThis cannot be undone. If it is still linked, it will appear again the next time it sends.`) &&
                      m.remove.mutate({ data: { machineId: x.machineId, deleteData: true } }, { onError: fail })
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      ) : null}
      {error && <p role="alert" className="mt-3 text-red-400">{error}</p>}
    </div>
  )
}

interface SectionProps {
  state: LinkState
  m: ReturnType<typeof useLinkMutations>
  fail: (e: unknown) => void
}

function MasterSection({ state, m, fail }: SectionProps) {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const net = state.network
  const [copyFailed, setCopyFailed] = useState(false)
  const copy = (text: string, label: string) => {
    // Called straight from the click, and nothing is awaited before it copies, so a page that is not secure can still do it.
    void copyText(text).then((ok) => {
      setCopyFailed(!ok)
      // The code can be selected by hand instead, so it is shown when copying did not work.
      if (!ok && label === 'code') setShown(true)
      if (ok) {
        setCopied(label)
        setTimeout(() => setCopied((c) => (c === label ? null : c)), 2000)
      }
    })
  }
  const on = state.link.listen === 'network'
  return (
    <>
      <section aria-label="Listen on the network" className={rowClass}>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Listen on the network</h2>
          <p className="text-[13px] text-[color:var(--hms-mute)]">
            <span style={{ color: net.listeningOnNetwork ? 'var(--hms-chip-ink)' : undefined }}>●</span>{' '}
            {net.listeningOnNetwork ? `Listening now on port ${net.port}.` : 'Only this computer can reach it right now.'}{' '}
            {net.firewall === 'allowed' && on ? 'Allowed through the firewall for this network and your tailnet. ' : ''}
            This lets nodes, and any browser on your network or tailnet, reach this machine. The dashboard has no login, so only turn it on on networks you trust.
          </p>
        </div>
        <Switch on={on} label="Listen on the network" onToggle={() => m.listen.mutate({ data: { listen: on ? 'local' : 'network' } }, { onError: fail })} />
      </section>
      {net.needsRestart && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-500">
          <span>HoldMySession has to restart for this to take effect.</span>
          {net.canRestart ? (
            <button type="button" className={button} disabled={m.restart.isPending} onClick={() => m.restart.mutate(undefined as never, { onError: fail })}>
              {m.restart.isPending ? 'Restarting…' : 'Restart now'}
            </button>
          ) : (
            <span>Close it and start it again.</span>
          )}
        </div>
      )}
      {net.firewall !== 'not-needed' && on && net.firewall !== 'allowed' && (
        <section aria-label="Windows Firewall" className={rowClass}>
          <div>
            <h2 className="text-base font-semibold">Windows Firewall</h2>
            <p className="text-[13px] text-amber-500">Not allowed yet, so other machines cannot connect.</p>
          </div>
          <button type="button" className={button} disabled={m.firewall.isPending} onClick={() => m.firewall.mutate(undefined as never, { onError: fail })}>
            Allow through the firewall
          </button>
        </section>
      )}

      <section aria-label="Addresses">
        <h2 className={sectionTitle}>Addresses</h2>
        {net.addresses.map((a) => (
          <div key={a.url} className={rowClass}>
            <div>
              <span className="font-mono">{a.url}</span>
              <span className="ml-2.5 text-[13px] text-[color:var(--hms-mute)]">
                {a.kind === 'lan' ? 'local network' : a.kind === 'tailnet' ? 'tailnet' : a.kind === 'name' ? 'computer name' : 'other'}
              </span>
            </div>
            <button type="button" className={button} onClick={() => copy(a.url, a.url)}>
              {copied === a.url ? 'Copied' : 'Copy'}
            </button>
          </div>
        ))}
        <p className="mt-2 text-[13px] text-[color:var(--hms-mute)]">Traffic is not encrypted, so use it on a network you trust or a tailnet.</p>
      </section>

      <section aria-label="Pairing code" className={`${rowClass} mt-6`}>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Pairing code</h2>
          <p className="text-[13px] text-[color:var(--hms-mute)]">
            Paste this on a node. It holds every address and the token. Nodes send names, projects, times and token counts, never transcripts.
          </p>
          <div className={`mt-2 max-w-xl font-mono text-[color:var(--hms-mute)] ${shown ? 'select-all break-all' : 'truncate'}`}>
            {net.pairingCode ? (shown ? net.pairingCode : 'hms1-' + '•'.repeat(16)) : 'Not ready yet'}
          </div>
          {copyFailed && (
            <p role="alert" className="mt-1.5 text-[13px] text-amber-400">
              This browser would not copy it. The code is shown above: select it and press Ctrl+C (Cmd+C on a Mac).
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} onClick={() => setShown((s) => !s)}>{shown ? 'Hide' : 'Show'}</button>
          <button type="button" className={button} disabled={!net.pairingCode} onClick={() => net.pairingCode && copy(net.pairingCode, 'code')}>
            {copied === 'code' ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            className={button}
            onClick={() => window.confirm('Make a new token? Every linked node stops sending until it has the new pairing code.') && m.token.mutate(undefined as never, { onError: fail })}
          >
            New token
          </button>
        </div>
      </section>
    </>
  )
}

function NodeSection({ state, m, fail }: SectionProps) {
  const [code, setCode] = useState('')
  const [url, setUrl] = useState(state.link.masterUrl)
  const [token, setToken] = useState('')
  const [manual, setManual] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  return state.linkedNode ? (
    <>
      <section aria-label="Linked master" className={rowClass}>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            Linked to {state.sync.masterName ?? state.link.masterUrl}
          </h2>
          <p className="text-[13px] text-[color:var(--hms-mute)]">
            <span className="font-mono">{state.link.masterUrl}</span> · last sent {when(state.sync.lastPushAt)}. Prices and the plan come from the master.
            {state.link.masterUrls.length > 1 && ` Also tried when that one does not answer: ${state.link.masterUrls.filter((u) => u !== state.link.masterUrl).join(', ')}.`}
          </p>
          {state.sync.lastError && <p role="alert" className="text-[13px] text-red-400">{state.sync.lastError}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={m.sync.isPending} onClick={() => m.sync.mutate({ data: { everything: false } }, { onError: fail })}>
            {m.sync.isPending ? 'Sending…' : 'Send now'}
          </button>
          <button type="button" className={button} disabled={m.sync.isPending} onClick={() => m.sync.mutate({ data: { everything: true } }, { onError: fail })}>
            Send everything again
          </button>
          <button
            type="button"
            className={danger}
            onClick={() => window.confirm('Unlink from the master? Its copy of your history stays with it, and this machine works on its own again.') && m.disconnect.mutate(undefined as never, { onError: fail })}
          >
            Unlink
          </button>
        </div>
      </section>
    </>
  ) : (
    <form
      className="border-b border-[color:var(--hms-rule)] py-[18px]"
      onSubmit={(e) => {
        e.preventDefault()
        setResult(null)
        m.connect.mutate({ data: manual ? { url, token } : { code } }, { onSuccess: (r) => setResult(r), onError: fail })
      }}
    >
      <h2 className="text-base font-semibold">Link to a master</h2>
      <p className="text-[13px] text-[color:var(--hms-mute)]">This machine works on its own until it is linked.</p>
      <div className="mt-3 flex flex-col gap-3">
        {!manual ? (
          <label className="flex flex-wrap items-center gap-3">
            <span className="w-32 text-[13px] text-[color:var(--hms-mute)]">Pairing code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the code from the master's Settings" autoComplete="off" className={`${input} min-w-[260px] flex-1 font-mono`} />
          </label>
        ) : (
          <>
            <label className="flex flex-wrap items-center gap-3">
              <span className="w-32 text-[13px] text-[color:var(--hms-mute)]">Master address</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.1.20:3000" className={`${input} min-w-[260px] flex-1 font-mono`} />
            </label>
            <label className="flex flex-wrap items-center gap-3">
              <span className="w-32 text-[13px] text-[color:var(--hms-mute)]">Token</span>
              <input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoComplete="off" className={`${input} min-w-[260px] flex-1 font-mono`} />
            </label>
          </>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="min-h-11 rounded-full bg-brand-400 px-5 text-sm font-semibold text-gray-950 hover:bg-brand-300 disabled:opacity-50" disabled={m.connect.isPending}>
            {m.connect.isPending ? 'Connecting…' : 'Connect'}
          </button>
          <button type="button" className="text-sm text-brand-400 hover:underline" onClick={() => setManual((v) => !v)}>
            {manual ? 'Use a pairing code instead' : 'Enter an address and token instead'}
          </button>
          {result && <span role={result.ok ? 'status' : 'alert'} className={result.ok ? 'text-[color:var(--hms-chip-ink)]' : 'text-red-400'}>{result.message}</span>}
        </div>
      </div>
    </form>
  )
}

function NameField({ machine, canEdit, onSave, asButton }: { machine: MachineSummary; canEdit: boolean; onSave: (name: string) => void; asButton?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  if (!canEdit) return asButton ? null : <span>{machine.name}</span>
  if (draft === null) {
    return asButton ? (
      <button type="button" className={button} onClick={() => setDraft(machine.name)}>Rename</button>
    ) : (
      <span className="flex items-center gap-2">
        <span className="font-medium">{machine.name}</span>
        <button type="button" className="text-brand-400 hover:underline" onClick={() => setDraft(machine.name)}>Rename</button>
      </span>
    )
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (draft.trim() && draft.trim() !== machine.name) onSave(draft)
        setDraft(null)
      }}
    >
      <input autoFocus value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} aria-label="Machine name" className={`${input} w-44`} />
      <button type="submit" className="text-sm text-brand-400 hover:underline">Save</button>
      <button type="button" className="text-sm text-[color:var(--hms-mute)] hover:underline" onClick={() => setDraft(null)}>Cancel</button>
    </form>
  )
}
