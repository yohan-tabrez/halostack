import { redirect } from 'next/navigation'
import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { getDb, commandJobs, servers, users } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { ArrowLeft, Clock, History, User, Server } from 'lucide-react'
import { auth } from '@/lib/auth'
import { canViewAudit } from '@/lib/rbac'

export default async function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canViewAudit(session.user.role)) redirect('/')

  const { id } = await params
  const db = getDb()

  const [job] = await db
    .select({
      id: commandJobs.id,
      command: commandJobs.command,
      status: commandJobs.status,
      stdout: commandJobs.stdout,
      stderr: commandJobs.stderr,
      exitCode: commandJobs.exitCode,
      queuedAt: commandJobs.queuedAt,
      completedAt: commandJobs.completedAt,
      hostname: servers.hostname,
      ipAddress: servers.ipAddress,
      email: users.email,
    })
    .from(commandJobs)
    .leftJoin(servers, eq(commandJobs.serverId, servers.id))
    .leftJoin(users, eq(commandJobs.issuedBy, users.id))
    .where(eq(commandJobs.id, id))
    .limit(1)

  if (!job) redirect('/audit')

  const durationMs = job.completedAt ? job.completedAt.getTime() - job.queuedAt.getTime() : null

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/audit" className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Execution Log</h2>
          <p className="text-muted-foreground text-sm mt-1 font-mono">Job ID: {job.id}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-border bg-card md:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Server className="size-3"/> Target Server</div>
              <div className="text-sm font-medium">{job.hostname || 'Unknown'}</div>
              <div className="text-xs text-muted-foreground">{job.ipAddress}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><User className="size-3"/> Invoked By</div>
              <div className="text-sm font-medium">{job.email || 'System'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><History className="size-3"/> Time</div>
              <div className="text-sm font-medium">{job.queuedAt.toLocaleString()}</div>
            </div>
            {durationMs && (
              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Clock className="size-3"/> Duration</div>
                <div className="text-sm font-medium">{(durationMs / 1000).toFixed(2)}s</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card md:col-span-2 min-h-[400px] flex flex-col">
          <CardHeader className="border-b border-border">
            <div className="font-mono text-sm text-primary break-all bg-background p-2 rounded">$ {job.command}</div>
          </CardHeader>
          <CardContent className="flex-1 p-4 font-mono text-sm whitespace-pre-wrap">
            {job.stdout && <div className="text-foreground mb-4">{job.stdout}</div>}
            {job.stderr && <div className="text-destructive">{job.stderr}</div>}
            {!job.stdout && !job.stderr && job.status === 'done' && (
              <div className="text-muted-foreground italic">No output recorded.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
