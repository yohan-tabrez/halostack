import { NextResponse } from 'next/server'
import { requireSession, isErrorResponse } from '@/lib/session'
import { getJobForUser } from '@/lib/job-access'

/**
 * Polling fallback for job status. The WebSocket is the primary path, but it must
 * never be the only one — if the socket can't connect, the UI would otherwise wait
 * on a job that already finished.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user

  const { id } = await params
  const job = await getJobForUser(id, user)

  // Not-found and not-permitted are deliberately indistinguishable: a 403 here
  // would confirm the job exists to someone who isn't allowed to know that.
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  return NextResponse.json(job)
}
