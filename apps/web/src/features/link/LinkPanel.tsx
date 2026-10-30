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
  return (
    <div className="space-y-3 border-t border-gray-800 pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-gray-300">Listen on the network</span>
        <button
          type="button"
          role="switch"
          aria-checked={state.link.listen === 'network'}
          aria-label="Listen on the network"
          onClick={() => m.listen.mutate({ data: { listen: state.link.listen === 'network' ? 'local' : 'network' } }, { onError: fail })}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
            state.link.listen === 'network' ? 'bg-brand-600' : 'bg-gray-800'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              state.link.listen === 'network' ? 'translate-x-[18px]' : 'translate-x-[3px]'
            }`}
          />
        </button>
        <span className="text-gray-500">
          Nodes connect to this machine's address, local network or tailnet, either works. Applies the next time HoldMySession starts.
        </span>
      </div>
      {state.link.listen !== 'network' && (
        <p className="text-amber-400">Nodes cannot reach this machine until that is on and HoldMySession is restarted.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-gray-300">Token for nodes</span>
        <code className="rounded bg-gray-950 px-2 py-1 font-mono text-gray-200">
          {shown ? state.link.nodeToken : '•'.repeat(24)}
        </code>
        <button type="button" className={button} onClick={() => setShown((s) => !s)}>{shown ? 'Hide' : 'Show'}</button>
        <button type="button" className={button} onClick={() => navigator.clipboard?.writeText(state.link.nodeToken)}>Copy</button>
        <button
          type="button"
          className={button}
          onClick={() => window.confirm('Make a new token? Every linked node stops sending until you give it the new one.') && m.token.mutate(undefined as never, { onError: fail })}
        >
          New token
        </button>
      </div>
      <p className="text-[10px] text-gray-500">
        On each node, enter this machine's address (for example http://192.168.1.20:3000 or http://my-pc.your-tailnet.ts.net:3000) and this token.
        Traffic is not encrypted, so use it on a network you trust or a tailnet.
      </p>
    </div>
  )
}

function NodeSection({ state, m, fail }: SectionProps) {
  const [url, setUrl] = useState(state.link.masterUrl)
  const [token, setToken] = useState('')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  return (
    <div className="space-y-3 border-t border-gray-800 pt-3">
      {state.linkedNode ? (
        <>
          <p className="text-gray-300">
            Linked to <span className="font-medium">{state.sync.masterName ?? state.link.masterUrl}</span>
            <span className="ml-2 font-mono text-gray-500">{state.link.masterUrl}</span>
          </p>
          <p className="text-gray-500">
            Last sent {when(state.sync.lastPushAt)}. Prices and the plan come from the master.
          </p>
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
            m.connect.mutate({ data: { url, token } }, { onSuccess: (r) => setResult(r), onError: fail })
          }}
        >
          <p className="font-medium text-gray-300">Link to a master</p>
          <label className="flex items-center gap-2">
            Master address
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.1.20:3000" className={`${input} flex-1 font-mono`} />
          </label>
          <label className="flex items-center gap-2">
            Token
            <input value={token} onChange={(e) => setToken(e.target.value)} type="password" autoComplete="off" className={`${input} flex-1 font-mono`} />
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" className={button} disabled={m.connect.isPending}>{m.connect.isPending ? 'Connecting…' : 'Connect'}</button>
            {result && <span role={result.ok ? 'status' : 'alert'} className={result.ok ? 'text-emerald-500' : 'text-red-400'}>{result.message}</span>}
          </div>
          <p className="text-[10px] text-gray-500">This machine works on its own until it is linked. Use the master's local or tailnet address, whichever this machine can reach.</p>
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
