'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Activity, BookOpen, Loader2, Play, ShieldAlert, Terminal as TerminalIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useJobWebSocket } from '@/hooks/useJobWebSocket'
import { toFriendlyJobError } from '@/lib/job-errors'
import { cn } from '@/lib/utils'

export type LibraryPick = {
  id: string
  name: string
  command: string
}

type Mode = 'server' | 'group'

export default function CommandRunBar({
  mode,
  serverId,
  serverStatus,
  groupId,
  onlineCount,
  library = [],
}: {
  mode: Mode
  serverId?: string
  serverStatus?: string
  groupId?: string
  onlineCount?: number
  library?: LibraryPick[]
}) {
  const [command, setCommand] = useState('')
  const [persistentMode, setPersistentMode] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<'queued' | 'running' | 'done' | 'failed' | null>(null)
  const [stdout, setStdout] = useState('')
  const [stderr, setStderr] = useState('')
  const [groupResult, setGroupResult] = useState<{ count: number; error?: string } | null>(null)
  const [pickedId, setPickedId] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const { lastUpdate } = useJobWebSocket(mode === 'server' ? currentJobId : null)

  const isOnline =
    mode === 'group'
      ? (onlineCount ?? 0) > 0
      : serverStatus === 'reachable' || serverStatus === 'unknown'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [stdout, stderr, jobStatus])

  useEffect(() => {
    if (!lastUpdate || lastUpdate.job_id !== currentJobId) return
    setJobStatus(lastUpdate.status as typeof jobStatus)
    if (lastUpdate.stdout) setStdout(lastUpdate.stdout)
    if (lastUpdate.stderr) setStderr(lastUpdate.stderr)
    if (lastUpdate.status === 'done' || lastUpdate.status === 'failed') setIsExecuting(false)
  }, [lastUpdate, currentJobId])

  function applyLibraryPick(id: string) {
    setPickedId(id)
    const item = library.find((c) => c.id === id)
    if (item) setCommand(item.command)
  }

  async function dispatch() {
    const trimmed = command.trim()
    if (!trimmed || !isOnline) return

    if (mode === 'group' && groupId) {
      setIsExecuting(true)
      setGroupResult(null)
      try {
        const res = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group_id: groupId, command: trimmed }),
        })
        if (!res.ok) {
          const { error } = await res.json()
          throw new Error(error || 'Failed to dispatch group jobs')
        }
        const { jobs } = await res.json()
        setCommand('')
        setPickedId('')
        setGroupResult({ count: jobs.length })
      } catch (err) {
        setGroupResult({
          count: 0,
          error: toFriendlyJobError(err instanceof Error ? err.message : 'Dispatch failed'),
        })
      } finally {
        setIsExecuting(false)
      }
      return
    }

    if (!serverId) return

    const unitName = `hs-$(date +%s%N | head -c14)`
    const finalCmd = persistentMode
      ? `systemd-run --unit=${unitName} --description="HALOStack job" bash -c ${JSON.stringify(trimmed)} && echo "Started as systemd unit: ${unitName}"`
      : trimmed

    setIsExecuting(true)
    setStdout('')
    setStderr('')
    setJobStatus('queued')
    setGroupResult(null)

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_id: serverId, command: finalCmd }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || 'Failed to dispatch job')
      }
      const { job } = await res.json()
      setCurrentJobId(job.id)
      setCommand('')
      setPickedId('')
      setStdout(
        persistentMode
          ? 'Starting as transient systemd unit…\n'
          : 'Dispatched to queue — waiting for SSH Agent…\n'
      )
    } catch (err) {
      setIsExecuting(false)
      setJobStatus('failed')
      setStderr(toFriendlyJobError(err instanceof Error ? err.message : 'Dispatch failed'))
    }
  }

  const statusColor =
    jobStatus === 'done'
      ? 'text-success'
      : jobStatus === 'failed'
        ? 'text-destructive'
        : 'text-warning'

  return (
    <Card className="flex min-h-[420px] flex-col border-border bg-card">
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="text-base">
          {mode === 'group' ? 'Fan-out execution' : 'Run command'}
        </CardTitle>
        <CardDescription>
          {mode === 'group'
            ? `Dispatches concurrently to all ${onlineCount ?? 0} online servers in this group.`
            : 'Dispatches a job to the SSH Agent queue. Pick from the Library or type ad-hoc.'}
        </CardDescription>
      </CardHeader>

      {mode === 'server' ? (
        <div className="min-h-[220px] flex-1 overflow-y-auto whitespace-pre-wrap bg-muted/40 p-4 font-mono text-sm leading-relaxed">
          {!currentJobId && !stdout && !stderr ? (
            <span className="select-none text-muted-foreground">— output will appear here —</span>
          ) : (
            <>
              {currentJobId && (
                <div className={cn('mb-2 select-none text-xs font-semibold', statusColor)}>
                  [{jobStatus?.toUpperCase()}] Job {currentJobId.slice(0, 8)}…
                  {' · '}
                  <Link href={`/jobs?job=${currentJobId}`} className="underline-offset-2 hover:underline">
                    History
                  </Link>
                </div>
              )}
              {stdout ? <span className="text-foreground">{stdout}</span> : null}
              {stderr ? <span className="text-destructive">{stderr}</span> : null}
              {isExecuting ? (
                <span className="mt-3 flex items-center gap-2 text-primary">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Running…
                </span>
              ) : null}
              <div ref={bottomRef} />
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center bg-muted/30 p-6 text-center">
          <ShieldAlert className="mb-4 size-10 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-lg font-medium text-foreground">Group dispatch</h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Results land in History for each target host.
          </p>
          {groupResult && !groupResult.error ? (
            <div className="mt-6 max-w-sm rounded-lg border border-success/30 bg-success/10 p-4">
              <p className="mb-2 font-medium text-success">
                Dispatched {groupResult.count} job{groupResult.count === 1 ? '' : 's'}
              </p>
              <Link
                href="/jobs"
                className={buttonVariants({ variant: 'outline', className: 'w-full' })}
              >
                View in History
              </Link>
            </div>
          ) : null}
          {groupResult?.error ? (
            <div className="mt-6 max-w-sm rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {groupResult.error}
            </div>
          ) : null}
        </div>
      )}

      <CardContent className="space-y-3 border-t border-border p-4">
        {library.length > 0 ? (
          <div className="flex items-center gap-2">
            <BookOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <select
              value={pickedId}
              onChange={(e) => applyLibraryPick(e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Pick from library"
            >
              <option value="">Pick from Library…</option>
              {library.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No library commands yet.{' '}
            <Link href="/commands" className="text-primary underline-offset-2 hover:underline">
              Add to Library
            </Link>
          </p>
        )}

        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-md border border-input bg-background px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <TerminalIcon className="mr-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="mr-2 font-mono text-sm text-primary">$</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isExecuting && dispatch()}
              placeholder={
                isOnline
                  ? mode === 'group'
                    ? 'apt update && apt upgrade -y'
                    : 'apt update'
                  : mode === 'group'
                    ? 'No online servers'
                    : 'Server is offline'
              }
              disabled={isExecuting || !isOnline}
              className="flex-1 border-none bg-transparent py-2 font-mono text-sm outline-none placeholder:text-muted-foreground"
              autoComplete="off"
            />
          </div>
          <Button type="button" onClick={dispatch} disabled={isExecuting || !command.trim() || !isOnline}>
            {isExecuting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : mode === 'group' ? (
              'Execute all'
            ) : (
              <Play className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>

        {mode === 'server' ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground select-none">
              <input
                type="checkbox"
                checked={persistentMode}
                onChange={(e) => setPersistentMode(e.target.checked)}
                className="accent-warning cursor-pointer"
              />
              <Activity className="size-3.5 text-warning" aria-hidden="true" />
              Run as persistent background service
            </label>
            <Link
              href="/commands"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              <BookOpen className="size-3.5" aria-hidden="true" /> Manage Library
            </Link>
          </div>
        ) : null}

        {mode === 'server' && persistentMode ? (
          <p className="rounded border border-warning/20 bg-warning/5 px-3 py-2 text-xs leading-relaxed text-warning">
            <strong className="font-semibold">systemd-run</strong> wraps your command in a transient
            unit. The unit name is printed in output — use{' '}
            <code className="font-mono">systemctl status</code> /{' '}
            <code className="font-mono">systemctl stop</code> to manage it.
          </p>
        ) : null}

        {!isOnline ? (
          <p className="flex items-center gap-1 text-xs text-warning">
            <ShieldAlert className="size-3" aria-hidden="true" />
            {mode === 'group'
              ? 'No online servers in this group.'
              : `Command execution is disabled while the server is ${serverStatus}.`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
