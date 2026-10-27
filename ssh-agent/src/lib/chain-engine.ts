import postgres from 'postgres'
import { Queue } from 'bullmq'
import crypto from 'crypto'
import pino from 'pino'
import { chainJobInsertValues } from './chain-job'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const sql = postgres(process.env.DATABASE_URL || '', { max: 4, prepare: false })
const commandsQueue = new Queue('ssh-commands', {
  connection: { url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' } as never,
})
const agentSecret = process.env.INTERNAL_AGENT_SECRET ?? ''

// Snapshot shape stored in chain_runs.graph_snapshot at launch. Commands are
// already interpolated and group targets already expanded to server ids, so the
// engine never has to resolve anything — it just walks the graph.
type SnapshotStep = {
  node_key: string
  command: string
  interactive: boolean
  target_server_ids: string[]
  continue_on_failure: boolean
}
type SnapshotEdge = { from: string; to: string; condition: 'on_success' | 'on_failure' | 'always' }
type Snapshot = { steps: SnapshotStep[]; edges: SnapshotEdge[] }

const RESOLVED = new Set(['done', 'failed', 'skipped', 'cancelled'])

/** Aggregate a node's per-server rows into a single node status. */
function nodeStatus(rowStatuses: string[]): 'pending' | 'active' | 'done' | 'failed' | 'skipped' {
  if (rowStatuses.some((s) => !RESOLVED.has(s) && s !== 'pending' && s !== 'ready')) return 'active'
  if (rowStatuses.some((s) => s === 'queued' || s === 'running' || s === 'awaiting_input'))
    return 'active'
  if (rowStatuses.every((s) => RESOLVED.has(s))) {
    if (rowStatuses.some((s) => s === 'failed')) return 'failed'
    if (rowStatuses.every((s) => s === 'skipped' || s === 'cancelled')) return 'skipped'
    return 'done'
  }
  return 'pending'
}

function edgeSatisfied(cond: SnapshotEdge['condition'], srcStatus: string): boolean {
  if (cond === 'always') return srcStatus === 'done' || srcStatus === 'failed' || srcStatus === 'skipped'
  if (cond === 'on_success') return srcStatus === 'done'
  return srcStatus === 'failed' // on_failure
}

async function enqueueStepJob(
  runStepId: string,
  serverId: string,
  command: string,
  interactive: boolean,
  issuedBy: string | null
): Promise<void> {
  const values = chainJobInsertValues(serverId, command, runStepId, issuedBy)
  const [job] = await sql`
    insert into command_jobs (server_id, command, status, chain_run_step_id, issued_by)
    values (${values.server_id}, ${values.command}, ${values.status}, ${values.chain_run_step_id}, ${values.issued_by})
    returning id`
  await sql`update chain_run_steps set status = 'queued', job_id = ${job.id} where id = ${runStepId}`

  const payload = { job_id: job.id, server_id: serverId, command }
  const body = JSON.stringify(payload)
  const signature = crypto.createHmac('sha256', agentSecret).update(body).digest('hex')
  await commandsQueue.add(
    'execute-command',
    { ...payload, payload: body, signature, interactive },
    { jobId: job.id }
  )
}

/**
 * Advance one chain run by one step. Idempotent and safe to call from multiple
 * triggers (run start, job completion, periodic sweep) — an advisory lock
 * serializes concurrent ticks for the same run, so at-least-once delivery is fine.
 */
export async function advance(runId: string): Promise<void> {
  await sql.begin(async (tx) => {
    // bigint advisory lock keyed by run id; auto-released at commit.
    await tx`select pg_advisory_xact_lock(hashtextextended(${runId}, 0))`

    const [run] = await tx`select status, graph_snapshot, created_by from chain_runs where id = ${runId}`
    if (!run || run.status !== 'running') return

    const issuedBy = (run.created_by as string | null) ?? null
    const snapshot = run.graph_snapshot as Snapshot
    const rows = await tx`
      select id, node_key, server_id, status from chain_run_steps where run_id = ${runId}`

    // Group rows by node.
    const byNode = new Map<string, { id: string; server_id: string; status: string }[]>()
    for (const r of rows) {
      const arr = byNode.get(r.node_key) ?? []
      arr.push({ id: r.id, server_id: r.server_id, status: r.status })
      byNode.set(r.node_key, arr)
    }

    const statusOf = new Map<string, string>()
    for (const [node, rs] of byNode) statusOf.set(node, nodeStatus(rs.map((r) => r.status)))

    const incoming = new Map<string, SnapshotEdge[]>()
    for (const e of snapshot.edges) {
      const arr = incoming.get(e.to) ?? []
      arr.push(e)
      incoming.set(e.to, arr)
    }

    for (const step of snapshot.steps) {
      const nodeRows = byNode.get(step.node_key) ?? []
      const pending = nodeRows.filter((r) => r.status === 'pending')
      if (!pending.length) continue // already progressed

      const preds = incoming.get(step.node_key) ?? []
      let ready: boolean
      let skip = false

      if (!preds.length) {
        ready = true // root
      } else {
        const predStatuses = preds.map((e) => statusOf.get(e.from) ?? 'pending')
        const allResolved = predStatuses.every((s) => s === 'done' || s === 'failed' || s === 'skipped')
        if (!allResolved) continue // wait
        ready = preds.every((e) => edgeSatisfied(e.condition, statusOf.get(e.from) ?? 'pending'))
        skip = !ready
      }

      if (skip) {
        await tx`update chain_run_steps set status = 'skipped'
          where run_id = ${runId} and node_key = ${step.node_key} and status = 'pending'`
        statusOf.set(step.node_key, 'skipped')
        continue
      }
      if (ready) {
        for (const r of pending) {
          await enqueueStepJob(r.id, r.server_id, step.command, step.interactive, issuedBy)
        }
        statusOf.set(step.node_key, 'active')
      }
    }

    // Finalize when nothing can still make progress.
    const fresh = await tx`select status from chain_run_steps where run_id = ${runId}`
    const anyActive = fresh.some((r) => !RESOLVED.has(r.status))
    if (!anyActive) {
      const anyFailed = fresh.some((r) => r.status === 'failed')
      await tx`update chain_runs
        set status = ${anyFailed ? 'failed' : 'done'}, finished_at = now()
        where id = ${runId} and status = 'running'`
    }
  })
}

/** Advance the run that owns a given chain_run_step (called when its job finishes). */
export async function advanceForStep(runStepId: string): Promise<void> {
  const [row] = await sql`select run_id from chain_run_steps where id = ${runStepId}`
  if (row) await advance(row.run_id)
}

/** Sweep every still-running chain — the safety net that makes the engine self-healing. */
export async function sweepRunningChains(): Promise<void> {
  const running = await sql`select id from chain_runs where status = 'running'`
  for (const r of running) {
    try {
      await advance(r.id)
    } catch (err) {
      logger.error({ run_id: r.id, err: (err as Error).message }, 'chain sweep advance failed')
    }
  }
}
