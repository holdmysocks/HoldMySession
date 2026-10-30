import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { clockPattern } from '@/lib/utils/time-format'
import { linkStateQuery, useLinkMutations } from './link.queries'
import type { LinkState, MachineSummary } from './link.api'

const input = 'rounded border border-gray-800 bg-gray-950 px-2 py-1 text-xs text-gray-100'
const button =
  'rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-300 hover:text-gray-100 disabled:opacity-50'
const when = (iso: string | null) => (iso ? format(new Date(iso), clockPattern('MMM d, HH:mm')) : 'never')

export function LinkPanel() {
  const { data: state } = useQuery(linkStateQuery)
  const m = useLinkMutations()
  const [error, setError] = useState<string | null>(null)
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  if (!state) return null
  const isMaster = state.link.role === 'master'
  const self = state.machines.find((x) => x.isSelf)

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-300">Linked machines</h2>
      <p className="mt-1 text-[10px] text-gray-500">
        Join two or more machines running HoldMySession so their history is in one place. Every install is a node and
        works on its own until you link it. One machine is set as the master: nodes send it their sessions and usage
        (names, projects, times and token counts, never transcripts), and it shows all of them, with a machine filter on
        every page. The master also holds the prices and the plan, which linked nodes read from it.
      </p>
      <div className="mt-3 space-y-4 rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-xs text-gray-400">
        <div role="radiogroup" aria-label="Role of this machine" className="flex flex-wrap items-center gap-3">
          <span className="text-gray-300">This machine is a</span>
          <div className="flex overflow-hidden rounded-lg border border-gray-800">
            {(['node', 'master'] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={state.link.role === r}
                disabled={m.role.isPending}
                onClick={() => state.link.role !== r && m.role.mutate({ data: { role: r } }, { onError: fail })}
                className={`px-3 py-1 text-xs transition-colors ${
                  state.link.role === r ? 'bg-brand-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'
                }`}
              >
                {r === 'node' ? 'Node' : 'Master'}
              </button>
            ))}
          </div>
          {self && <NameField machine={self} canEdit onSave={(name) => m.rename.mutate({ data: { machineId: self.machineId, name } }, { onError: fail })} />}
        </div>

        {isMaster ? (
          <MasterSection state={state} m={m} fail={fail} />
        ) : (
          <NodeSection state={state} m={m} fail={fail} />
        )}

        {state.machines.length > 1 || isMaster ? (
          <div>
            <p className="mb-1 font-medium text-gray-300">Machines</p>
            <ul className="space-y-1">
              {state.machines.map((x) => (
                <li key={x.machineId} className="flex flex-wrap items-center gap-x-3 border-t border-gray-800 pt-1">
                  <NameField
                    machine={x}
                    canEdit={isMaster || x.isSelf}
                    onSave={(name) => m.rename.mutate({ data: { machineId: x.machineId, name } }, { onError: fail })}
                  />
                  <span className="text-gray-500">{x.isSelf ? 'this machine' : 'node'}</span>
                  <span className="font-mono text-gray-500">{x.sessions} sessions</span>
                  {!x.isSelf && <span className="text-gray-500">last seen {when(x.lastSeenAt)}</span>}
                  {x.appVersion && !x.isSelf && <span className="font-mono text-gray-600">v{x.appVersion}</span>}
                  {isMaster && !x.isSelf && (
                    <button
                      type="button"
                      className="ml-auto text-red-400 hover:text-red-300"
                      onClick={() =>
                        window.confirm(`Remove ${x.name} and delete its ${x.sessions} sessions from this history?\n\nThis cannot be undone. If it is still linked, it will appear again the next time it sends.`) &&
                        m.remove.mutate({ data: { machineId: x.machineId, deleteData: true } }, { onError: fail })
                      }
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {error && <p role="alert" className="text-red-400">{error}</p>}
      </div>
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
  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied((c) => (c === label ? null : c)), 2000)
  }
  const on = state.link.listen === 'network'
  return (
    <div className="space-y-4 border-t border-gray-800 pt-3">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-gray-300">Listen on the network</span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Listen on the network"
            onClick={() => m.listen.mutate({ data: { listen: on ? 'local' : 'network' } }, { onError: fail })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-gray-800'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
          </button>
          <span className={net.listeningOnNetwork ? 'text-emerald-500' : 'text-gray-500'}>
            {net.listeningOnNetwork ? 'Listening on the network now' : 'Only this computer can reach it right now'}
          </span>
        </div>
        {net.needsRestart && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-500">
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
        {net.firewall !== 'not-needed' && on && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-gray-300">Windows Firewall</span>
            <span className={net.firewall === 'allowed' ? 'text-emerald-500' : 'text-amber-500'}>
              {net.firewall === 'allowed' ? 'Allowed for this network and your tailnet' : 'Not allowed yet, so other machines cannot connect'}
            </span>
            {net.firewall !== 'allowed' && (
              <button type="button" className={button} disabled={m.firewall.isPending} onClick={() => m.firewall.mutate(undefined as never, { onError: fail })}>
                Allow through the firewall
              </button>
            )}
          </div>
        )}
        <p className="text-[10px] text-gray-500">
          This lets nodes, and any browser on your network or tailnet, reach this machine on port {net.port}. The firewall rule is limited to
          your own network and the tailnet, and the dashboard itself has no login, so only turn it on on networks you trust.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="font-medium text-gray-300">Link a node</p>
        <p className="text-gray-500">On the other machine, open Settings, Linked machines, and paste this code. It holds every address of this machine and the token, so it works on the local network and the tailnet.</p>
        <div className="flex flex-wrap items-center gap-3">
          <code className="max-w-md truncate rounded bg-gray-950 px-2 py-1 font-mono text-gray-200">
            {net.pairingCode ? (shown ? net.pairingCode : '•'.repeat(32)) : 'Not ready yet'}
          </code>
          <button type="button" className={button} onClick={() => setShown((s) => !s)}>{shown ? 'Hide' : 'Show'}</button>
          <button type="button" className={button} disabled={!net.pairingCode} onClick={() => net.pairingCode && copy(net.pairingCode, 'code')}>
            {copied === 'code' ? 'Copied' : 'Copy pairing code'}
          </button>
          <button
            type="button"
            className={button}
            onClick={() => window.confirm('Make a new token? Every linked node stops sending until it has the new pairing code.') && m.token.mutate(undefined as never, { onError: fail })}
          >
            New token
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <p className="font-medium text-gray-300">This machine's addresses</p>
        <ul className="space-y-1">
          {net.addresses.map((a) => (
            <li key={a.url} className="flex flex-wrap items-center gap-x-3">
              <span className="w-56 font-mono text-gray-200">{a.url}</span>
              <span className="text-gray-500">{a.kind === 'lan' ? 'local network' : a.kind === 'tailnet' ? 'tailnet' : a.kind === 'name' ? 'computer name' : 'other'}</span>
              <button type="button" className="text-brand-600 hover:underline" onClick={() => copy(a.url, a.url)}>
                {copied === a.url ? 'Copied' : 'Copy'}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-gray-500">Traffic is not encrypted, so use it on a network you trust or a tailnet.</p>
      </div>
    </div>
  )
}

function NodeSection({ state, m, fail }: SectionProps) {
  const [code, setCode] = useState('')
  const [url, setUrl] = useState(state.link.masterUrl)
  const [token, setToken] = useState('')
  const [manual, setManual] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  return (
    <div className="space-y-3 border-t border-gray-800 pt-3">
      {state.linkedNode ? (
        <>
          <p className="text-gray-300">
            Linked to <span className="font-medium">{state.sync.masterName ?? state.link.masterUrl}</span>
            <span className="ml-2 font-mono text-gray-500">{state.link.masterUrl}</span>
          </p>
          {state.link.masterUrls.length > 1 && (
            <p className="text-gray-500">Also tried when that one does not answer: {state.link.masterUrls.filter((u) => u !== state.link.masterUrl).join(', ')}</p>
          )}
          <p className="text-gray-500">Last sent {when(state.sync.lastPushAt)}. Prices and the plan come from the master.</p>
          {state.sync.lastError && <p role="alert" className="text-red-400">{state.sync.lastError}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={button} disabled={m.sync.isPending} onClick={() => m.sync.mutate({ data: { everything: false } }, { onError: fail })}>
              {m.sync.isPending ? 'Sending…' : 'Send now'}
            </button>
            <button type="button" className={button} disabled={m.sync.isPending} onClick={() => m.sync.mutate({ data: { everything: true } }, { onError: fail })}>
              Send everything again
            </button>
            <button
              type="button"
              className={button}
              onClick={() => window.confirm('Unlink from the master? Its copy of your history stays with it, and this machine works on its own again.') && m.disconnect.mutate(undefined as never, { onError: fail })}
            >
              Unlink
            </button>
          </div>
        </>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            setResult(null)
            m.connect.mutate({ data: manual ? { url, token } : { code } }, { onSuccess: (r) => setResult(r), onError: fail })
          }}
        >
          <p className="font-medium text-gray-300">Link to a master</p>
          {!manual ? (
            <label className="flex items-center gap-2">
              Pairing code
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the code from the master's Settings" autoComplete="off" className={`${input} flex-1 font-mono`} />
            </label>
          ) : (
            <>
              <label className="flex items-center gap-2">
                Master address
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.1.20:3000" className={`${input} flex-1 font-mono`} />
              </label>
              <label className="flex items-center gap-2">
                Token
                <input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoComplete="off" className={`${input} flex-1 font-mono`} />
              </label>
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={button} disabled={m.connect.isPending}>{m.connect.isPending ? 'Connecting…' : 'Connect'}</button>
            <button type="button" className="text-brand-600 hover:underline" onClick={() => setManual((v) => !v)}>
              {manual ? 'Use a pairing code instead' : 'Enter an address and token instead'}
            </button>
            {result && <span role={result.ok ? 'status' : 'alert'} className={result.ok ? 'text-emerald-500' : 'text-red-400'}>{result.message}</span>}
          </div>
          <p className="text-[10px] text-gray-500">This machine works on its own until it is linked.</p>
        </form>
      )}
    </div>
  )
}

function NameField({ machine, canEdit, onSave }: { machine: MachineSummary; canEdit: boolean; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  if (!canEdit) return <span className="text-gray-200">{machine.name}</span>
  if (draft === null) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-gray-200">{machine.name}</span>
        <button type="button" className="text-brand-600 hover:underline" onClick={() => setDraft(machine.name)}>Rename</button>
      </span>
    )
  }
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (draft.trim() && draft.trim() !== machine.name) onSave(draft)
        setDraft(null)
      }}
    >
      <input autoFocus value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} aria-label="Machine name" className={`${input} w-40`} />
      <button type="submit" className="text-brand-600 hover:underline">Save</button>
      <button type="button" className="text-gray-500 hover:underline" onClick={() => setDraft(null)}>Cancel</button>
    </form>
  )
}
