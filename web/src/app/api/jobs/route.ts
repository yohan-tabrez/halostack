import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, commandJobs, servers } from '@/lib/db'
import { sshCommandsQueue } from '@/lib/queue'
import { rateLimit } from '@/lib/rate-limit'
import { requireSessionOrApiKey, isErrorResponse } from '@/lib/session'
import { canExecuteCommands } from '@/lib/rbac'
import { scopedServerIds } from '@/lib/scope'
import { signJobPayload } from '@/lib/job-sign'
import { audit } from '@/lib/audit'
import { checkCommandFailureSpike } from '@/lib/anomaly'
import { internalError } from '@/lib/api-error'

export async function POST(request: Request) {
  try {
    const user = await requireSessionOrApiKey(request)
    if (isErrorResponse(user)) return user
    if (!canExecuteCommands(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { success } = await rateLimit(user.id, 10, 60)
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again in a minute.' }, { status: 429 })
    }

    await checkCommandFailureSpike(user.id, user.email)

    const body = await request.json()
    const { server_id, group_id, command, interactive } = body

    if ((!server_id && !group_id) || !command) {
      return NextResponse.json(
        { error: 'server_id or group_id, and command are required' },
        { status: 400 }
      )
    }

    const db = getDb()
    // Restrict targets to what this user may reach — a group_admin must not be
    // able to run commands on servers outside their groups.
    const allowed = await scopedServerIds(user)
    let serversToExecute: { id: string; status: string }[] = []

    if (group_id) {
      const rows = await db.select().from(servers).where(eq(servers.groupId, group_id))
      if (!rows.length) {
        return NextResponse.json({ error: 'Group not found or has no servers' }, { status: 404 })
      }
      serversToExecute = rows.map((s) => ({ id: s.id, status: s.status }))
    } else {
      const [server] = await db.select().from(servers).where(eq(servers.id, server_id)).limit(1)
      if (!server) {
        return NextResponse.json({ error: 'Server not found' }, { status: 404 })
      }
      serversToExecute = [{ id: server.id, status: server.status }]
    }

    if (allowed !== null) {
      serversToExecute = serversToExecute.filter((s) => allowed.has(s.id))
      if (!serversToExecute.length) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const reachable = serversToExecute.filter((s) => s.status !== 'unreachable')
    if (!reachable.length) {
      return NextResponse.json({ error: 'All target servers are unreachable' }, { status: 409 })
    }

    const jobs = await db
      .insert(commandJobs)
      .values(
        reachable.map((s) => ({
          serverId: s.id,
          command,
          issuedBy: user.id,
          status: 'queued' as const,
        }))
      )
      .returning()

    const secret = process.env.INTERNAL_AGENT_SECRET ?? ''
    const bullJobs = jobs.map((job) => {
      const payload = {
        job_id: job.id,
        server_id: job.serverId,
        command,
      }
      const signed = signJobPayload(payload, secret)
      return {
        name: 'execute-command',
        data: {
          ...payload,
          payload: signed.body,
          signature: signed.signature,
          interactive: Boolean(interactive),
        },
        opts: { jobId: job.id },
      }
    })

    await sshCommandsQueue.addBulk(bullJobs)

    await audit({
      action: 'command.execute',
      actorId: user.id,
      actorEmail: user.email,
      resourceType: 'command',
      serverId: group_id ? undefined : server_id,
      groupId: group_id || undefined,
      metadata: { command, jobCount: jobs.length },
    })

    return NextResponse.json({ job: jobs[0], jobs }, { status: 201 })
  } catch (error) {
    return internalError('Failed to enqueue job', error)
  }
}
