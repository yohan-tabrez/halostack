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

  // Rename left the old repeatable key behind (BullMQ keys by name+pattern).
  for (const job of await queue.getRepeatableJobs()) {
    if (job.name === 'drop-old-partitions') await queue.removeRepeatableByKey(job.key)
  }

  await queue.add(
    'purge-old-history',
    { retentionMonths },
    {
      repeat: { pattern: '0 3 1 * *' },
      jobId: 'retention-monthly',
      removeOnComplete: true,
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
