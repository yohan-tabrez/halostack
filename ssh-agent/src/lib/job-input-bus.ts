import Redis from 'ioredis'

// Routes a user's prompt response to the exact worker process running that job.
// The web tier PUBLISHes to job-input:<jobId>; only the process executing that job
// has a handler registered. A subscribed connection can't run normal commands, so
// this owns its own connection separate from the worker's.
const sub = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
})
const handlers = new Map<string, (response: string) => void>()

sub.psubscribe('job-input:*')
sub.on('pmessage', (_pattern, channel, message) => {
  const jobId = channel.slice('job-input:'.length)
  handlers.get(jobId)?.(message)
})

/** Register a handler for one job's input; returns an unsubscribe. */
export function onJobInput(jobId: string, handler: (response: string) => void): () => void {
  handlers.set(jobId, handler)
  return () => handlers.delete(jobId)
}
