import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { getDb, commandJobs, servers, userGroupMemberships, users } from '@/lib/db'
import { canExecuteCommands } from '@/lib/rbac'
import type { JobUpdate } from '@/hooks/useJobWebSocket'
import { JobsClient } from './JobsClient'

export const dynamic = 'force-dynamic'

type JobRow = {
  id: string
  serverId: string
  issuedBy: string | null
  status: string
  stdout: string | null
  stderr: string | null
  exitCode: number | null
  groupId: string | null
  command: string
  queuedAt: Date
  hostname: string | null
  issuerEmail: string | null
}

export default async function JobsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canExecuteCommands(session.user.role)) redirect('/')

  const db = getDb()
  const user = session.user

  const selectShape = {
    id: commandJobs.id,
    serverId: commandJobs.serverId,
    issuedBy: commandJobs.issuedBy,
    status: commandJobs.status,
    stdout: commandJobs.stdout,
    stderr: commandJobs.stderr,
    exitCode: commandJobs.exitCode,
    groupId: servers.groupId,
    command: commandJobs.command,
    queuedAt: commandJobs.queuedAt,
    hostname: servers.hostname,
    issuerEmail: users.email,
  }

  let rows: JobRow[]

  if (user.role === 'global_admin') {
    rows = await db
      .select(selectShape)
      .from(commandJobs)
      .leftJoin(servers, eq(servers.id, commandJobs.serverId))
      .leftJoin(users, eq(users.id, commandJobs.issuedBy))
      .orderBy(desc(commandJobs.queuedAt))
      .limit(50)
  } else {
    const memberships = await db
      .select({ groupId: userGroupMemberships.groupId })
      .from(userGroupMemberships)
      .where(eq(userGroupMemberships.userId, user.id))
    const groupIds = memberships.map((m) => m.groupId)

    const all = await db
      .select(selectShape)
      .from(commandJobs)
      .leftJoin(servers, eq(servers.id, commandJobs.serverId))
      .leftJoin(users, eq(users.id, commandJobs.issuedBy))
      .orderBy(desc(commandJobs.queuedAt))
      .limit(200)

    rows = all
      .filter(
        (r) => r.issuedBy === user.id || (r.groupId !== null && groupIds.includes(r.groupId))
      )
      .slice(0, 50)
  }

  const initialJobs: JobUpdate[] = rows.map((r) => ({
    type: 'job_update',
    job_id: r.id,
    server_id: r.serverId,
    issued_by: r.issuedBy,
    group_id: r.groupId,
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    exit_code: r.exitCode,
    command: r.command,
    hostname: r.hostname,
    issuer_email: r.issuerEmail,
    queued_at: r.queuedAt.toISOString(),
  }))

  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading history…</div>}>
      <JobsClient initialJobs={initialJobs} />
    </Suspense>
  )
}
