import Redis from 'ioredis'

let client: Redis | null = null

/** True while `next build` is evaluating modules — never open Redis then. */
export function isNextBuild(): boolean {
  return (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.NEXT_PHASE === 'phase-export'
  )
}

/**
 * Shared ioredis client. Lazy so importing this module during `next build`
 * does not attempt a connection to localhost:6379.
 */
export function getRedis(): Redis {
  if (isNextBuild()) {
    throw new Error('Redis is not available during next build')
  }
  if (!client) {
    client = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      // Keep RESP2 for BullMQ Lua/reply compatibility with ioredis v6.
      protocol: 2,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      enableOfflineQueue: false,
    })
    client.on('error', (err) => {
      // Avoid unhandled error events crashing the process; callers handle rejects.
      if (process.env.NODE_ENV !== 'production') {
        console.error('[redis]', err.message)
      }
    })
  }
  return client
}

/** Connect if needed; safe no-op when already ready. */
export async function ensureRedis(): Promise<Redis> {
  const redis = getRedis()
  if (redis.status === 'wait') {
    await redis.connect()
  }
  return redis
}
