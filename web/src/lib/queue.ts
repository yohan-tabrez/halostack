import { Queue, QueueOptions } from 'bullmq'
import { getRedis, isNextBuild } from '@/lib/redis'

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 500 },
}

let commandsQueue: Queue | null = null
let healthQueue: Queue | null = null

function queueOptions(): QueueOptions {
  return {
    connection: getRedis() as never,
    defaultJobOptions,
  }
}

function getCommandsQueue(): Queue {
  if (isNextBuild()) {
    throw new Error('BullMQ queues are not available during next build')
  }
  if (!commandsQueue) {
    commandsQueue = new Queue('ssh-commands', queueOptions())
  }
  return commandsQueue
}

function getHealthQueue(): Queue {
  if (isNextBuild()) {
    throw new Error('BullMQ queues are not available during next build')
  }
  if (!healthQueue) {
    healthQueue = new Queue('ssh-health', {
      ...queueOptions(),
      defaultJobOptions: {
        ...defaultJobOptions,
        priority: 10,
      },
    })
  }
  return healthQueue
}

/** Lazy proxy so `import { sshCommandsQueue }` does not construct a Queue at module load. */
export const sshCommandsQueue = new Proxy({} as Queue, {
  get(_t, prop, receiver) {
    const q = getCommandsQueue()
    const value = Reflect.get(q, prop, receiver)
    return typeof value === 'function' ? value.bind(q) : value
  },
})

export const sshHealthQueue = new Proxy({} as Queue, {
  get(_t, prop, receiver) {
    const q = getHealthQueue()
    const value = Reflect.get(q, prop, receiver)
    return typeof value === 'function' ? value.bind(q) : value
  },
})

// Legacy alias
export const sshQueue = sshCommandsQueue

const healthInterval = Number(process.env.HEALTH_CHECK_INTERVAL_MS ?? 300000)

export async function scheduleServerHealth(serverId: string) {
  await getHealthQueue().upsertJobScheduler(
    `health-repeat-${serverId}`,
    { every: healthInterval },
    {
      name: 'health-check',
      data: { job_id: `health-${serverId}`, server_id: serverId, command: 'uname -a' },
      opts: {
        removeOnComplete: true,
        removeOnFail: 100,
      },
    }
  )
}

export async function unscheduleServerHealth(serverId: string) {
  await getHealthQueue().removeJobScheduler(`health-repeat-${serverId}`)
}

export const CHAIN_ADVANCE_CHANNEL = 'chain-advance'

export async function triggerChainAdvance(runId: string) {
  const redis = getRedis()
  if (redis.status === 'wait') await redis.connect()
  await redis.publish(CHAIN_ADVANCE_CHANNEL, runId)
}

export async function triggerJobInput(jobId: string, response: string) {
  const redis = getRedis()
  if (redis.status === 'wait') await redis.connect()
  await redis.publish(`job-input:${jobId}`, response)
}
