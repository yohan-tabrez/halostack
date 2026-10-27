import { and, eq, gte, sql } from 'drizzle-orm'
import { getDb, commandJobs } from '@/lib/db'
import { audit } from '@/lib/audit'

const FAILURE_SPIKE_N = 5
const WINDOW_MS = 10 * 60 * 1000

/**
 * If the user already has >N failed jobs in the last 10 minutes, write an alert
 * audit event. Does not block enqueue — detection only.
 */
export async function checkCommandFailureSpike(
  userId: string,
  email: string
): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS)
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(commandJobs)
    .where(
      and(
        eq(commandJobs.issuedBy, userId),
        eq(commandJobs.status, 'failed'),
        gte(commandJobs.completedAt, since)
      )
    )
  const count = row?.count ?? 0
  if (count > FAILURE_SPIKE_N) {
    await audit({
      action: 'anomaly.command_failure_spike',
      actorId: userId,
      actorEmail: email,
      outcome: 'failure',
      severity: 'alert',
      metadata: { failureCount: count, windowMinutes: 10, threshold: FAILURE_SPIKE_N },
    })
  }
}
