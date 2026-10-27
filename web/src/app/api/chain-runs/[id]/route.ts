import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, chainRuns, chainRunSteps } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canAccessChainRun } from '@/lib/ownership'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  const { id } = await params
  const db = getDb()
  const [run] = await db.select().from(chainRuns).where(eq(chainRuns.id, id)).limit(1)
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canAccessChainRun(user, run.createdBy)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const steps = await db.select().from(chainRunSteps).where(eq(chainRunSteps.runId, id))
  return NextResponse.json({ run, steps })
}
