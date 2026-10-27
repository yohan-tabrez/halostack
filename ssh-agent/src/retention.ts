import { Queue } from 'bullmq'
import Redis from 'ioredis'
import pino from 'pino'
import { sql } from 'drizzle-orm'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

export async function startRetentionJob() {
  const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    // Keep RESP2 for BullMQ Lua/reply compatibility with ioredis v6.
    protocol: 2,
    maxRetriesPerRequest: null,
  })
  const queue = new Queue('maintenance', { connection: redis as never })
  const retentionMonths = Number(process.env.JOB_RETENTION_MONTHS ?? 6)

  // Drop renamed legacy scheduler id if present (BullMQ v6 Job Schedulers).
  await queue.removeJobScheduler('drop-old-partitions').catch(() => undefined)

  await queue.upsertJobScheduler(
    'retention-monthly',
    { pattern: '0 3 1 * *' },
    {
      name: 'purge-old-history',
      data: { retentionMonths },
      opts: { removeOnComplete: true },
    }
  )

  new (await import('bullmq')).Worker(
    'maintenance',
    async () => {
      const { getDb } = await import('./lib/db')
      const db = getDb()
      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - retentionMonths)
      const cutoffIso = cutoff.toISOString()
      await db.execute(
        sql`DELETE FROM command_jobs WHERE queued_at < ${cutoffIso}::timestamptz`
      )
      await db.execute(
        sql`DELETE FROM audit_log WHERE occurred_at < ${cutoffIso}::timestamptz`
      )
      logger.info({ cutoff }, 'Retention job purged old command_jobs and audit_log rows')
    },
    { connection: redis as never }
  )
}
