import { NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, chainRuns, chainRunSteps } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canExecuteCommands } from '@/lib/rbac'
import { canAccessChainRun } from '@/lib/ownership'
import { abortChainRunJobs } from '@/lib/chain-abort'

// Cancel a run: mark it and pending steps cancelled, and signal the agent to
// abort in-flight SSH for this run's jobs.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canExecuteCommands(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const db = getDb()
  const [run] = await db.select().from(chainRuns).where(eq(chainRuns.id, id)).limit(1)
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canAccessChainRun(user, run.createdBy)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (run.status !== 'running') {
    return NextResponse.json({ error: 'Run is not running.' }, { status: 409 })
  }

  const activeSteps = await db
    .select({ jobId: chainRunSteps.jobId })
    .from(chainRunSteps)
    .where(
      and(
        eq(chainRunSteps.runId, id),
        inArray(chainRunSteps.status, ['queued', 'running', 'awaiting_input', 'ready'])
      )
    )

  await db.transaction(async (tx) => {
    await tx
      .update(chainRunSteps)
      .set({ status: 'cancelled' })
      .where(
        and(
          eq(chainRunSteps.runId, id),
          inArray(chainRunSteps.status, ['pending', 'ready', 'queued', 'running', 'awaiting_input'])
        )
      )
    await tx
      .update(chainRuns)
      .set({ status: 'cancelled', finishedAt: new Date() })
      .where(eq(chainRuns.id, id))
  })

  const jobIds = activeSteps.map((s) => s.jobId).filter((id): id is string => Boolean(id))
  await abortChainRunJobs(id, jobIds)

  return NextResponse.json({ success: true })
}
