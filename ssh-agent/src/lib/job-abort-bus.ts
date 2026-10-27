import Redis from 'ioredis'
import type { ClientChannel } from 'ssh2'

// Web publishes job-abort:<jobId> (and chain-abort:<runId> with the same job ids).
// Only the process holding the in-flight stream has an entry here.
const sub = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
})

type ActiveExec = {
  stream: ClientChannel | null
  kill: () => void
}

const activeByJobId = new Map<string, ActiveExec>()

sub.psubscribe('job-abort:*')
sub.on('pmessage', (_pattern, channel) => {
  const jobId = channel.slice('job-abort:'.length)
  activeByJobId.get(jobId)?.kill()
})

/** Register an in-flight SSH exec so abort pub/sub can kill it. */
export function trackActiveJob(jobId: string): {
  setStream: (stream: ClientChannel) => void
  untrack: () => void
  wasAborted: () => boolean
} {
  let aborted = false
  const entry: ActiveExec = {
    stream: null,
    kill: () => {
      aborted = true
      const stream = entry.stream
      if (!stream) return
      try {
        stream.signal('KILL')
      } catch {
        /* ignore */
      }
      try {
        stream.close()
      } catch {
        /* ignore */
      }
      try {
        stream.destroy()
      } catch {
        /* ignore */
      }
    },
  }
  activeByJobId.set(jobId, entry)

  return {
    setStream: (stream) => {
      entry.stream = stream
      if (aborted) entry.kill()
    },
    untrack: () => {
      if (activeByJobId.get(jobId) === entry) activeByJobId.delete(jobId)
    },
    wasAborted: () => aborted,
  }
}

export class JobAbortedError extends Error {
  constructor(jobId?: string) {
    super(jobId ? `Job aborted: ${jobId}` : 'Job aborted')
    this.name = 'JobAbortedError'
  }
}
