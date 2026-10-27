import { eq } from 'drizzle-orm'
import { getDb, commandJobs, servers, userGroupMemberships } from '@/lib/db'
import type { SessionUser } from '@/lib/rbac'

export type JobUpdatePayload = {
  type: 'job_update'
  job_id: string
  server_id: string
  issued_by: string | null
  group_id: string | null
  status: string
  stdout?: string | null
  stderr?: string | null
  exit_code?: number | null
}

/**
 * Mirrors the agent's broadcast rule in ssh-agent/src/lib/job-ws.ts:
 * owner OR in-group OR global_admin. Kept in one place so the WebSocket push
 * and the REST fallback can't drift apart on who is allowed to see a job.
 */
export async function getJobForUser(
  jobId: string,
  user: SessionUser
): Promise<JobUpdatePayload | null> {
  const db = getDb()

  const [row] = await db
    .select({
      id: commandJobs.id,
      serverId: commandJobs.serverId,
      issuedBy: commandJobs.issuedBy,
      status: commandJobs.status,
      stdout: commandJobs.stdout,
      stderr: commandJobs.stderr,
      exitCode: commandJobs.exitCode,
      groupId: servers.groupId,
    })
    .from(commandJobs)
    .leftJoin(servers, eq(servers.id, commandJobs.serverId))
    .where(eq(commandJobs.id, jobId))
    .limit(1)

  if (!row) return null

  const isOwner = row.issuedBy !== null && row.issuedBy === user.id
  const isGlobalAdmin = user.role === 'global_admin'

  let inGroup = false
  if (!isOwner && !isGlobalAdmin && row.groupId) {
    const memberships = await db
      .select({ groupId: userGroupMemberships.groupId })
      .from(userGroupMemberships)
      .where(eq(userGroupMemberships.userId, user.id))
    inGroup = memberships.some((m) => m.groupId === row.groupId)
  }

  if (!isOwner && !isGlobalAdmin && !inGroup) return null

  // Shaped identically to the WebSocket job_update frame so one client reducer
  // can consume either source.
  return {
    type: 'job_update',
    job_id: row.id,
    server_id: row.serverId,
    issued_by: row.issuedBy,
    group_id: row.groupId ?? null,
    status: row.status,
    stdout: row.stdout,
    stderr: row.stderr,
    exit_code: row.exitCode,
  }
}
