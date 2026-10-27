import { ensureRedis, isNextBuild } from '@/lib/redis'

export async function rateLimit(
  userId: string,
  limit: number = 10,
  windowSeconds: number = 60,
  bucket: string = 'jobs'
): Promise<{ success: boolean; remaining: number }> {
  if (isNextBuild()) {
    return { success: false, remaining: 0 }
  }
  try {
    const redis = await ensureRedis()
    const key = `rate_limit:${bucket}:${userId}`
    const currentCount = await redis.incr(key)
    if (currentCount === 1) {
      await redis.expire(key, windowSeconds)
    }
    return {
      success: currentCount <= limit,
      remaining: Math.max(0, limit - currentCount),
    }
  } catch {
    // Fail closed: without Redis we cannot enforce limits or safely queue work.
    return { success: false, remaining: 0 }
  }
}
