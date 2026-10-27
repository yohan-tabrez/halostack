'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { applyJobUpdate, useJobsFeed, type JobUpdate } from '@/hooks/useJobWebSocket'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/PageHeader'
import { Activity, CheckCircle2, Clock, XCircle } from 'lucide-react'

function StatusIcon({ status, exitCode }: { status: string; exitCode?: number | null }) {
  if (status === 'failed' || status === 'cancelled') {
    return <XCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
  }
  if (status === 'done') {
    return (
      <CheckCircle2
        className={`size-4 shrink-0 ${exitCode === 0 ? 'text-success' : 'text-warning'}`}
        aria-hidden="true"
      />
    )
  }
  return <Clock className="size-4 shrink-0 animate-pulse text-warning" aria-hidden="true" />
}

function statusBadgeVariant(status: string): 'success' | 'destructive' | 'warning' | 'secondary' {
  if (status === 'done') return 'success'
  if (status === 'failed' || status === 'cancelled') return 'destructive'
  if (status === 'running' || status === 'queued' || status === 'awaiting_input') return 'warning'
  return 'secondary'
}

function formatRelative(iso?: string | null) {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleString()
}

export function JobsClient({ initialJobs }: { initialJobs: JobUpdate[] }) {
  const searchParams = useSearchParams()
  const highlight = searchParams.get('job')

  useEffect(() => {
    for (const job of initialJobs) applyJobUpdate(job)
  }, [initialJobs])

  const jobs = useJobsFeed()
  const ordered = useMemo(() => {
    if (!highlight) return jobs
    return [...jobs].sort((a, b) => {
      if (a.job_id === highlight) return -1
      if (b.job_id === highlight) return 1
      return 0
    })
  }, [jobs, highlight])

  return (
    <div className="space-y-6">
      <PageHeader
        title="History"
        description="Recent command jobs from the database, updated live over WebSocket."
      />

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="size-5 text-primary" aria-hidden="true" />
            Job feed
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!ordered.length ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No recent jobs.</div>
          ) : (
            <ul className="divide-y divide-border">
              {ordered.map((job) => (
                <li
                  key={job.job_id}
                  className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center ${
                    highlight === job.job_id ? 'bg-primary/5' : 'hover:bg-muted/40'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <StatusIcon status={job.status} exitCode={job.exit_code} />
                    <div className="min-w-0 flex-1">
                      <code
                        className="block truncate font-mono text-xs text-foreground"
                        title={job.command ?? undefined}
                      >
                        {job.command?.trim() || job.job_id.slice(0, 8)}
                      </code>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{job.hostname ?? '—'}</span>
                        <span>{job.issuer_email ?? '—'}</span>
                        <span>{formatRelative(job.queued_at)}</span>
                        <span className="font-mono opacity-70">{job.job_id.slice(0, 8)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:pl-2">
                    <Badge variant={statusBadgeVariant(job.status)}>{job.status.replace(/_/g, ' ')}</Badge>
                    <Link
                      href={`/audit/${job.job_id}`}
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Detail
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
