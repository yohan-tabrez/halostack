'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Clock, Loader2, SkipForward, Ban, MessageCircleQuestion } from 'lucide-react'

type RunStep = { id: string; nodeKey: string; serverId: string | null; status: string; jobId: string | null }
type Run = { id: string; status: string; startedAt: string; finishedAt: string | null }

const TERMINAL = new Set(['done', 'failed', 'cancelled'])

const STEP_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle2 className="size-4 text-primary" />,
  failed: <XCircle className="size-4 text-destructive" />,
  skipped: <SkipForward className="size-4 text-muted-foreground" />,
  cancelled: <Ban className="size-4 text-muted-foreground" />,
  awaiting_input: <MessageCircleQuestion className="size-4 text-warning" />,
  running: <Loader2 className="size-4 text-warning animate-spin" />,
  queued: <Clock className="size-4 text-muted-foreground" />,
  pending: <Clock className="size-4 text-muted-foreground" />,
}

export default function ChainRunView({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null)
  const [steps, setSteps] = useState<RunStep[]>([])

  useEffect(() => {
    let stop = false
    const tick = async () => {
      const res = await fetch(`/api/chain-runs/${runId}`)
      if (!res.ok || stop) return
      const data = await res.json()
      setRun(data.run)
      setSteps(data.steps)
      if (TERMINAL.has(data.run.status)) stop = true
    }
    void tick()
    const iv = setInterval(() => {
      if (stop) return
      void tick()
    }, 1500)
    return () => {
      stop = true
      clearInterval(iv)
    }
  }, [runId])

  const awaiting = steps.filter((s) => s.status === 'awaiting_input')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Chain Run</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Status: <span className="capitalize text-foreground">{run?.status ?? '…'}</span>
        </p>
      </div>

      {awaiting.map((s) => (
        <AwaitingInput key={s.id} jobId={s.jobId!} nodeKey={s.nodeKey} />
      ))}

      <div className="divide-y divide-border rounded-lg border border-border">
        {steps.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            {STEP_ICON[s.status] ?? <Clock className="size-4 text-muted-foreground" />}
            <span className="font-mono text-sm text-foreground">{s.nodeKey}</span>
            <span className="text-xs text-muted-foreground">{s.serverId?.slice(0, 8) ?? '—'}</span>
            <span className="ml-auto text-xs capitalize text-muted-foreground">{s.status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AwaitingInput({ jobId, nodeKey }: { jobId: string; nodeKey: string }) {
  const [value, setValue] = useState('')
  const [sent, setSent] = useState(false)

  const send = async () => {
    const res = await fetch(`/api/jobs/${jobId}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: value }),
    })
    if (res.ok) setSent(true)
  }

  return (
    <div className="rounded-md border border-amber-700/50 bg-amber-900/20 p-3">
      <div className="flex items-center gap-2 text-sm text-amber-200">
        <MessageCircleQuestion className="size-4" />
        Step <span className="font-mono">{nodeKey}</span> is waiting for input.
      </div>
      {sent ? (
        <p className="mt-2 text-xs text-muted-foreground">Response sent.</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
            placeholder="Your response…"
          />
          <button
            onClick={send}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90"
          >
            Send
          </button>
        </div>
      )}
    </div>
  )
}
