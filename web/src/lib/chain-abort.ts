import { ensureRedis, isNextBuild } from '@/lib/redis'

/** Publish abort signals so the agent can kill in-flight SSH for cancelled chain jobs. */
export async function abortChainRunJobs(runId: string, jobIds: string[]): Promise<void> {
  if (isNextBuild()) return
  try {
    const redis = await ensureRedis()
    await redis.publish(`chain-abort:${runId}`, JSON.stringify({ job_ids: jobIds }))
    for (const jobId of jobIds) {
      await redis.publish(`job-abort:${jobId}`, '1')
    }
  } catch (err) {
    console.error('Failed to publish chain abort:', err)
  }
}
