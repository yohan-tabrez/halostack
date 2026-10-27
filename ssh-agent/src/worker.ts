import { Worker, Job, Queue, UnrecoverableError } from 'bullmq'
import { Client as SSHClient } from 'ssh2'
import Redis from 'ioredis'
import pino from 'pino'
import { eq } from 'drizzle-orm'
import { getDb, commandJobs, servers, credentials, chainRunSteps } from './lib/db'
import { advance, advanceForStep, sweepRunningChains } from './lib/chain-engine'
import { onJobInput } from './lib/job-input-bus'
import { audit } from './lib/audit'
import { bufferFromDb, decryptBlob, aadFor, encServerField, decServerField } from './lib/crypto'
import { verifyHostKey } from './lib/host-key'
import {
  acquireConnection,
  evictConnection,
  releaseConnection,
  setPooledConnection,
} from './lib/ssh-pool'
import { JobAbortedError, trackActiveJob } from './lib/job-abort-bus'
import { verifyJobPayload } from './lib/job-sign'
import { broadcastJobUpdate } from './lib/job-ws'
import { jobsTotal } from './metrics'
import { withSpan } from './otel'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const redisConnection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
})

const stdoutCap = Number(process.env.STDOUT_CAP_BYTES ?? 262144)
const jobTimeoutMs = Number(process.env.JOB_TIMEOUT_MS ?? 60000)
const healthInterval = Number(process.env.HEALTH_CHECK_INTERVAL_MS ?? 300000)
const HEALTH_FAIL_THRESHOLD = 3
const promptStallMs = Number(process.env.PROMPT_STALL_MS ?? 1500)
const awaitingTimeoutMs = Number(process.env.AWAITING_INPUT_TIMEOUT_MS ?? 300000)
// Trailing text that looks like an interactive prompt (no trailing newline).
const PROMPT_RE = /(?:password[^\n]*:|\[y\/n\]|\(yes\/no\)|\?|:)[ \t]*$/i
const agentSecret = process.env.INTERNAL_AGENT_SECRET ?? ''
const masterSecret = process.env.MASTER_SECRET ?? ''
const masterSecretPrevious = process.env.MASTER_SECRET_PREVIOUS

interface SSHJobData {
  job_id: string
  server_id: string
  command: string
  signature?: string
  payload?: string
  type?: 'command' | 'health'
  interactive?: boolean
}

function capOutput(text: string): string {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes <= stdoutCap) return text
  return Buffer.from(text, 'utf8').subarray(0, stdoutCap).toString('utf8') + '\n...[truncated]'
}

function wrapSudoCommand(rawCommand: string, hasSudoPassword: boolean): string {
  if (!hasSudoPassword) return rawCommand
  if (rawCommand.trimStart().startsWith('sudo')) return rawCommand
  return `sudo -S -p '' ${rawCommand}`
}

function isPermanentFailure(error: Error): boolean {
  const msg = error.message.toLowerCase()
  return (
    msg.includes('authentication') ||
    msg.includes('auth fail') ||
    msg.includes('host key mismatch') ||
    msg.includes('incorrect password') ||
    msg.includes('sudo password') ||
    msg.includes('invalid job signature')
  )
}

async function updateJob(
  jobId: string,
  patch: Partial<{
    status: 'queued' | 'running' | 'awaiting_input' | 'done' | 'failed' | 'cancelled'
    stdout: string
    stderr: string
    exit_code: number
    started_at: Date
    completed_at: Date
    awaiting_prompt: string | null
    awaiting_since: Date | null
  }>
) {
  const db = getDb()
  const [job] = await db
    .update(commandJobs)
    .set({
      status: patch.status,
      stdout: patch.stdout,
      stderr: patch.stderr,
      exitCode: patch.exit_code,
      startedAt: patch.started_at,
      completedAt: patch.completed_at,
      awaitingPrompt: patch.awaiting_prompt,
      awaitingSince: patch.awaiting_since,
    })
    .where(eq(commandJobs.id, jobId))
    .returning()

  if (job) {
    const [server] = await db
      .select({ groupId: servers.groupId })
      .from(servers)
      .where(eq(servers.id, job.serverId))
      .limit(1)

    broadcastJobUpdate({
      job_id: job.id,
      server_id: job.serverId,
      issued_by: job.issuedBy,
      group_id: server?.groupId ?? null,
      status: job.status,
      stdout: job.stdout,
      stderr: job.stderr,
      exit_code: job.exitCode,
      awaiting_prompt: job.awaitingPrompt,
    })

    // If this job belongs to a chain, mirror its status onto the run step and
    // nudge the chain forward. Fire-and-forget: a chain hiccup mustn't fail the job.
    if (job.chainRunStepId) {
      // For chain branching, a non-zero exit counts as failure (the job itself is
      // only 'failed' on infra errors). This is what makes on_failure edges useful.
      const stepStatus =
        job.status === 'done' && (job.exitCode ?? 0) !== 0 ? 'failed' : job.status
      db.update(chainRunSteps)
        .set({ status: stepStatus })
        .where(eq(chainRunSteps.id, job.chainRunStepId))
        .then(() => {
          if (['done', 'failed', 'cancelled'].includes(stepStatus)) {
            return advanceForStep(job.chainRunStepId!)
          }
        })
        .catch((e) => logger.error({ err: (e as Error).message }, 'chain advance failed'))
    }
  }
}

async function getConnection(
  serverId: string,
  host: string,
  port: number,
  username: string,
  creds: Record<string, unknown>,
  pinnedFingerprint: string | null
): Promise<SSHClient> {
  const pooled = acquireConnection(serverId)
  if (pooled) return pooled.conn

  return new Promise((resolve, reject) => {
    const conn = new SSHClient()
    let fingerprintToStore: string | null = null

    conn.on('ready', async () => {
      if (fingerprintToStore) {
        const db = getDb()
        // Pin the host key encrypted at rest (TOFU).
        const { enc, iv, tag } = encServerField(fingerprintToStore, serverId, masterSecret)
        await db
          .update(servers)
          .set({ hostKeyFpEnc: enc, hostKeyFpIv: iv, hostKeyFpTag: tag, encVersion: 1 })
          .where(eq(servers.id, serverId))
      }
      setPooledConnection(serverId, conn)
      acquireConnection(serverId)
      resolve(conn)
    })

    conn.on('error', (err) => reject(err))

    conn.connect({
      host,
      port,
      username,
      privateKey: creds.ssh_auth_type === 'key' ? (creds.ssh_private_key as string) : undefined,
      passphrase:
        creds.ssh_auth_type === 'key' && creds.ssh_passphrase
          ? (creds.ssh_passphrase as string)
          : undefined,
      password: creds.ssh_auth_type === 'password' ? (creds.ssh_password as string) : undefined,
      readyTimeout: 10000,
      hostVerifier: (key: Buffer) => {
        const result = verifyHostKey(key, pinnedFingerprint)
        if (!result.ok) {
          // High-severity: a changed host key is the MITM / hijack signal.
          audit({ action: 'hostkey.mismatch', serverId, outcome: 'failure', severity: 'alert' })
          reject(new Error('Host key mismatch'))
          return false
        }
        if (result.isNew) fingerprintToStore = result.fingerprint
        return true
      },
    })
  })
}

async function executeSSHCommand(
  serverId: string,
  host: string,
  port: number,
  username: string,
  creds: Record<string, unknown>,
  rawCommand: string,
  jobId: string,
  pinnedFingerprint: string | null,
  skipJobUpdates = false,
  interactive = false
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  let acquired = false
  // Health checks use synthetic ids; still track so aborts are a no-op if unused.
  const tracker = trackActiveJob(jobId)
  try {
    const conn = await getConnection(serverId, host, port, username, creds, pinnedFingerprint)
    acquired = true
    const hasSudoPassword = Boolean(creds.sudo_password)
    const finalCommand = wrapSudoCommand(rawCommand, hasSudoPassword)
    const sudoPassword = hasSudoPassword ? String(creds.sudo_password) : null

    return await new Promise((resolve, reject) => {
      let stdoutBuffer = ''
      let stderrBuffer = ''
      let settled = false
      let awaiting = false

      // The run timeout is paused while we wait on the user; otherwise a paused
      // interactive job would die at jobTimeoutMs mid-prompt.
      let timer: ReturnType<typeof setTimeout>
      const armTimeout = (ms: number, msg: string) => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          if (!settled) {
            settled = true
            unsubscribeInput?.()
            // Mark dead while leased; release in finally tears it down.
            evictConnection(serverId)
            reject(new Error(msg))
          }
        }, ms)
      }
      let unsubscribeInput: (() => void) | undefined
      armTimeout(jobTimeoutMs, 'Job timed out')

      const flush = () => {
        if (skipJobUpdates) return
        updateJob(jobId, {
          stdout: capOutput(stdoutBuffer),
          stderr: capOutput(stderrBuffer),
        }).catch((err) => logger.error({ err }, 'Failed streaming job update'))
      }

      let lastFlush = Date.now()
      const throttledFlush = () => {
        const now = Date.now()
        if (now - lastFlush > 500) {
          lastFlush = now
          flush()
        }
      }

      // Interactive commands need a PTY — without one, sudo/apt/read see no tty and
      // never prompt. A PTY merges stderr into stdout, so stderr stays empty here.
      // ECHO:0 stops the tty echoing stdin (sudo password, user responses) back into
      // captured stdout — otherwise secrets injected to stdin would leak to the DB.
      const execOpts: import('ssh2').ExecOptions = interactive
        ? { pty: { modes: { ECHO: 0 } } }
        : {}

      conn.exec(finalCommand, execOpts, (err, stream) => {
        if (err) {
          clearTimeout(timer)
          evictConnection(serverId)
          return reject(err)
        }

        tracker.setStream(stream)

        if (sudoPassword && stream.stdin) {
          stream.stdin.write(sudoPassword + '\n')
          // Keep stdin open for interactive jobs so later prompts can be answered.
          if (!interactive) stream.stdin.end()
        }

        // Prompt detection: after output stalls, if the tail looks like a prompt and
        // we're not already waiting, pause and ask the user.
        let stallTimer: ReturnType<typeof setTimeout> | undefined
        const enterAwaiting = () => {
          if (awaiting || settled) return
          const tail = stdoutBuffer.slice(-512)
          if (!PROMPT_RE.test(tail)) return
          awaiting = true
          const promptText = tail.split('\n').pop()?.trim() || tail.trim()
          armTimeout(awaitingTimeoutMs, 'Timed out waiting for user input')
          updateJob(jobId, {
            status: 'awaiting_input',
            awaiting_prompt: promptText,
            awaiting_since: new Date(),
          }).catch((e) => logger.error({ err: e }, 'awaiting_input update failed'))
          unsubscribeInput = onJobInput(jobId, (response) => {
            if (!awaiting || settled) return
            stream.stdin.write(response + '\n')
            awaiting = false
            armTimeout(jobTimeoutMs, 'Job timed out')
            updateJob(jobId, {
              status: 'running',
              awaiting_prompt: null,
              awaiting_since: null,
            }).catch(() => {})
          })
        }
        const scheduleStallCheck = () => {
          if (!interactive) return
          clearTimeout(stallTimer)
          stallTimer = setTimeout(enterAwaiting, promptStallMs)
        }

        const cleanup = () => {
          clearTimeout(timer)
          clearTimeout(stallTimer)
          unsubscribeInput?.()
        }

        stream
          .on('close', (code: number) => {
            cleanup()
            if (settled) return
            settled = true
            if (tracker.wasAborted()) {
              reject(new JobAbortedError(jobId))
              return
            }
            resolve({ stdout: capOutput(stdoutBuffer), stderr: capOutput(stderrBuffer), code })
          })
          .on('data', (data: Buffer) => {
            stdoutBuffer += data.toString()
            throttledFlush()
            scheduleStallCheck()
          })

        stream.stderr.on('data', (data: Buffer) => {
          stderrBuffer += data.toString()
          throttledFlush()
        })

        stream.on('error', (streamErr: Error) => {
          cleanup()
          if (tracker.wasAborted()) {
            if (!settled) {
              settled = true
              reject(new JobAbortedError(jobId))
            }
            return
          }
          evictConnection(serverId)
          if (!settled) {
            settled = true
            reject(streamErr)
          }
        })
      })
    })
  } finally {
    tracker.untrack()
    if (acquired) releaseConnection(serverId)
  }
}

function isUnreachableHold(err: Error): boolean {
  return /server is unreachable/i.test(err.message)
}

function isAbortError(err: Error): boolean {
  return err.name === 'JobAbortedError' || /^job aborted/i.test(err.message)
}

async function processJob(job: Job<SSHJobData>, isHealth = false) {
  const { job_id, server_id, command, signature, payload } = job.data

  if (!isHealth) {
    if (!agentSecret || !signature || !payload || !verifyJobPayload(payload, signature, agentSecret)) {
      throw new UnrecoverableError('Invalid job signature')
    }
  }

  const db = getDb()
  const [server] = await db.select().from(servers).where(eq(servers.id, server_id)).limit(1)
  if (!server) throw new Error('Failed to fetch server details')
  // Recoverable: BullMQ retries with backoff until health flips the server reachable.
  if (!isHealth && server.status === 'unreachable') {
    throw new Error('Server is unreachable')
  }

  if (!isHealth) {
    await updateJob(job_id, { status: 'running', started_at: new Date() })
  }

  // host_key_fingerprint is encrypted at rest once enc_version >= 1; older rows
  // still hold it in plaintext.
  const pinnedFp =
    server.encVersion >= 1
      ? decServerField(
          server.hostKeyFpEnc,
          server.hostKeyFpIv,
          server.hostKeyFpTag,
          server.id,
          masterSecret,
          masterSecretPrevious || undefined
        )
      : server.hostKeyFingerprint

  const [credsRow] = await db
    .select()
    .from(credentials)
    .where(eq(credentials.serverId, server_id))
    .limit(1)
  if (!credsRow) throw new Error('Failed to fetch credentials')
  if (!masterSecret) throw new Error('MASTER_SECRET is missing')

  const decrypted = decryptBlob(
    bufferFromDb(credsRow.encryptedBlob as Buffer),
    bufferFromDb(credsRow.iv as Buffer),
    bufferFromDb(credsRow.authTag as Buffer),
    masterSecret,
    credsRow.keyVersion,
    masterSecretPrevious || undefined,
    // v1 blobs predate AAD; only v2+ rows are bound to their credential id.
    credsRow.keyVersion >= 2 ? aadFor(credsRow.id, 'cred', credsRow.keyVersion) : undefined
  )

  if (isHealth) {
    const output = await executeSSHCommand(
      server_id,
      server.ipAddress,
      server.port,
      credsRow.username,
      decrypted,
      'uname -a',
      `health-${server_id}`,
      pinnedFp,
      true
    )
    await redisConnection.del(`server:healthfail:${server_id}`)
    // os_info encrypted at rest; drop any legacy plaintext.
    const osEnc = encServerField(JSON.stringify({ uname: output.stdout.trim() }), server_id, masterSecret)
    await db
      .update(servers)
      .set({
        status: 'reachable',
        lastSeen: new Date(),
        osInfo: null,
        osInfoEnc: osEnc.enc,
        osInfoIv: osEnc.iv,
        osInfoTag: osEnc.tag,
        encVersion: 1,
      })
      .where(eq(servers.id, server_id))
    return { success: true }
  }

  const output = await executeSSHCommand(
    server_id,
    server.ipAddress,
    server.port,
    credsRow.username,
    decrypted,
    command,
    job_id,
    pinnedFp,
    false,
    Boolean(job.data.interactive)
  )

  if (
    output.code === 1 &&
    output.stderr.toLowerCase().includes('incorrect password') &&
    decrypted.sudo_password
  ) {
    await audit({ action: 'sudo.failure', serverId: server_id, outcome: 'failure', severity: 'alert' })
    throw new Error('Sudo password incorrect')
  }

  await updateJob(job_id, {
    status: 'done',
    completed_at: new Date(),
    stdout: output.stdout,
    stderr: output.stderr,
    exit_code: output.code ?? 0,
  })
  jobsTotal.inc({ status: 'success' })
  return { success: true }
}

// Counter lives in Redis, not Postgres — health checks are frequent and this is
// pure churn. Expires at 3x the interval so a recovered-then-quiet server resets.
async function markHealthFailure(serverId: string) {
  const key = `server:healthfail:${serverId}`
  const count = await redisConnection.incr(key)
  await redisConnection.pexpire(key, healthInterval * 3)
  if (count >= HEALTH_FAIL_THRESHOLD) {
    const db = getDb()
    await db.update(servers).set({ status: 'unreachable' }).where(eq(servers.id, serverId))
  }
}

function createWorker(queueName: string, isHealth = false) {
  return new Worker<SSHJobData>(
    queueName,
    async (job) => {
      try {
        return await withSpan(
          isHealth ? 'ssh.health' : 'ssh.command',
          {
            'halostack.job_id': job.data.job_id,
            'halostack.server_id': job.data.server_id,
            'halostack.queue': queueName,
          },
          () => processJob(job, isHealth)
        )
      } catch (error) {
        const err = error as Error
        logger.error({ job_id: job.data.job_id, err: err.message }, 'Job failed')

        if (isAbortError(err)) {
          if (!isHealth) {
            await updateJob(job.data.job_id, {
              status: 'cancelled',
              completed_at: new Date(),
              stderr: err.message,
            })
            jobsTotal.inc({ status: 'cancelled' })
          }
          throw new UnrecoverableError(err.message)
        }

        // Unreachable is temporary — leave job status alone so BullMQ can retry.
        if (!isHealth && !isUnreachableHold(err)) {
          await updateJob(job.data.job_id, {
            status: 'failed',
            completed_at: new Date(),
            stderr: err.message,
          })
          jobsTotal.inc({ status: 'failed' })
        } else if (isHealth) {
          await markHealthFailure(job.data.server_id)
        }
        // UnrecoverableError tells BullMQ not to retry — auth failures and host
        // key mismatches won't fix themselves, and a mismatch is the MITM signal.
        if (isPermanentFailure(err)) throw new UnrecoverableError(err.message)
        throw err
      }
    },
    {
      connection: redisConnection as never,
      concurrency: Number(process.env.SSH_CONCURRENCY ?? 10),
    }
  )
}

export const commandsWorker = createWorker('ssh-commands', false)
export const healthWorker = createWorker('ssh-health', true)

commandsWorker.on('failed', (job, err) => {
  logger.error({ job_id: job?.data.job_id, err: err.message }, 'BullMQ command job failed')
})

healthWorker.on('failed', (job, err) => {
  logger.error({ server_id: job?.data.server_id, err: err.message }, 'Health check failed')
})

logger.info('SSH Agent workers started on ssh-commands and ssh-health queues')

// Safety net: re-advance any running chain every 60s in case a completion trigger
// was missed (agent restart, crash between job finish and advance). advance() is
// idempotent + advisory-locked, so this can't double-run a step.
setInterval(() => {
  sweepRunningChains().catch((e) => logger.error({ err: (e as Error).message }, 'chain sweep failed'))
}, 60_000)

// Immediate kick from the web tier when a run is created (a subscriber connection
// can't run normal commands, so it's separate from redisConnection).
const chainSub = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
})
chainSub.subscribe('chain-advance')
chainSub.on('message', (_ch, runId) => {
  advance(runId).catch((e) => logger.error({ run_id: runId, err: (e as Error).message }, 'chain advance failed'))
})

export async function scheduleHealthChecks() {
  const db = getDb()
  const allServers = await db.select({ id: servers.id }).from(servers)
  const healthQueue = new Queue('ssh-health', { connection: redisConnection as never })
  const interval = Number(process.env.HEALTH_CHECK_INTERVAL_MS ?? 300000)

  for (const server of allServers) {
    await healthQueue.add(
      'health-check',
      {
        job_id: `health-${server.id}`,
        server_id: server.id,
        command: 'uname -a',
      },
      {
        repeat: { every: interval },
        jobId: `health-repeat-${server.id}`,
        removeOnComplete: true,
        removeOnFail: 100,
      }
    )
  }
}
