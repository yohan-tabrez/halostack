import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, commandJobs } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canExecuteCommands } from '@/lib/rbac'
import { rateLimit } from '@/lib/rate-limit'
import { triggerJobInput } from '@/lib/queue'

// Supply a response to a job that is blocked on an interactive prompt. Answering a
// prompt is command execution, so it's gated the same way — and only accepted while
// the job is actually awaiting input, so it can't be used to inject arbitrary stdin.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canExecuteCommands(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { success } = await rateLimit(user.id, 30, 60)
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const response = typeof body?.response === 'string' ? body.response : null
  if (response === null) {
    return NextResponse.json({ error: 'response is required' }, { status: 400 })
  }

  const db = getDb()
  const [job] = await db
    .select({ status: commandJobs.status, issuedBy: commandJobs.issuedBy })
    .from(commandJobs)
    .where(eq(commandJobs.id, id))
    .limit(1)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (job.status !== 'awaiting_input') {
    return NextResponse.json({ error: 'Job is not awaiting input.' }, { status: 409 })
  }
  if (user.role !== 'global_admin' && job.issuedBy !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // The response is never persisted or logged — it may be a password.
  await triggerJobInput(id, response)
  return NextResponse.json({ accepted: true }, { status: 202 })
}
