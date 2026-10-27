import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { and, count, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { getDb, servers, commandJobs, interactiveSessions } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/PageHeader'
import { Server, Activity, ShieldAlert, TerminalSquare, CheckCircle2, XCircle, Clock } from 'lucide-react'
import Link from 'next/link'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const db = getDb()
  const since = sql`now() - interval '24 hours'`

  const [serverCount, jobCount, failedCount, sessionCount, recentJobs] = await Promise.all([
    db.select({ value: count() }).from(servers),
    db.select({ value: count() }).from(commandJobs).where(gte(commandJobs.queuedAt, since)),
    db
      .select({ value: count() })
      .from(commandJobs)
      .where(and(eq(commandJobs.status, 'failed'), gte(commandJobs.queuedAt, since))),
    db
      .select({ value: count() })
      .from(interactiveSessions)
      .where(isNull(interactiveSessions.closedAt)),
    db
      .select({
        id: commandJobs.id,
        command: commandJobs.command,
        status: commandJobs.status,
        exitCode: commandJobs.exitCode,
        queuedAt: commandJobs.queuedAt,
        hostname: servers.hostname,
      })
      .from(commandJobs)
      .leftJoin(servers, eq(commandJobs.serverId, servers.id))
      .orderBy(desc(commandJobs.queuedAt))
      .limit(8),
  ])

  const stats = [
    {
      label: 'Total servers',
      value: serverCount[0]?.value ?? 0,
      icon: Server,
      sub: 'Registered nodes',
      color: 'text-muted-foreground',
    },
    {
      label: 'Jobs (24 h)',
      value: jobCount[0]?.value ?? 0,
      icon: Activity,
      sub: 'Commands dispatched',
      color: 'text-primary',
    },
    {
      label: 'Failed (24 h)',
      value: failedCount[0]?.value ?? 0,
      icon: ShieldAlert,
      sub: 'Needs attention',
      color: failedCount[0]?.value ? 'text-destructive' : 'text-muted-foreground',
    },
    {
      label: 'Active PTY',
      value: sessionCount[0]?.value ?? 0,
      icon: TerminalSquare,
      sub: 'Live shells open',
      color: sessionCount[0]?.value ? 'text-info' : 'text-muted-foreground',
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" description="Fleet health and recent command activity." />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className={`h-4 w-4 ${s.color}`} aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
          <Link href="/jobs" className="text-xs font-medium text-primary underline-offset-2 hover:underline">
            View History
          </Link>
        </div>
        <Card className="border-border bg-card">
          <CardContent className="p-0">
            {!recentJobs.length ? (
              <div className="flex flex-col items-center justify-center p-10 text-muted-foreground">
                <Activity className="mb-3 size-8 opacity-40" aria-hidden="true" />
                <p className="text-sm">No activity yet. Add a server and run a command.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="shrink-0">
                      {job.status === 'done' && job.exitCode === 0 && (
                        <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                      )}
                      {job.status === 'done' && job.exitCode !== 0 && (
                        <CheckCircle2 className="size-4 text-warning" aria-hidden="true" />
                      )}
                      {job.status === 'failed' && (
                        <XCircle className="size-4 text-destructive" aria-hidden="true" />
                      )}
                      {(job.status === 'queued' || job.status === 'running') && (
                        <Clock className="size-4 animate-pulse text-warning" aria-hidden="true" />
                      )}
                    </div>
                    <code
                      className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs text-foreground"
                      title={job.command}
                    >
                      {job.command}
                    </code>
                    <span className="shrink-0 text-xs text-muted-foreground">{job.hostname ?? '—'}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(job.queuedAt).toLocaleTimeString()}
                    </span>
                    <Link
                      href={`/audit/${job.id}`}
                      className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Detail
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
