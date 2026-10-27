import { NextResponse } from 'next/server'
import { eq, inArray } from 'drizzle-orm'
import {
  getDb,
  chains,
  chainSteps,
  chainEdges,
  chainRuns,
  chainRunSteps,
  commands,
  servers,
} from '@/lib/db'
import { requireSessionOrApiKey, isErrorResponse } from '@/lib/session'
import { canExecuteCommands } from '@/lib/rbac'
import { scopedServerIds } from '@/lib/scope'
import { interpolate } from '@/lib/interpolate'
import { triggerChainAdvance } from '@/lib/queue'
import { audit } from '@/lib/audit'

// Launch a chain: resolve targets, interpolate commands, snapshot the graph, seed
// run steps, then kick the engine. All resolution happens here so the agent-side
// engine only ever walks a fully-resolved snapshot.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionOrApiKey(request)
  if (isErrorResponse(user)) return user
  if (!canExecuteCommands(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const runVariables: Record<string, string> = body?.variables ?? {}
  const allowRaw = user.role === 'global_admin' && body?.raw === true

  const db = getDb()
  const [chain] = await db.select().from(chains).where(eq(chains.id, id)).limit(1)
  if (!chain) return NextResponse.json({ error: 'Chain not found' }, { status: 404 })

  const [steps, edges] = await Promise.all([
    db.select().from(chainSteps).where(eq(chainSteps.chainId, id)),
    db.select().from(chainEdges).where(eq(chainEdges.chainId, id)),
  ])
  if (!steps.length) return NextResponse.json({ error: 'Chain has no steps' }, { status: 400 })

  const cmdRows = await db
    .select()
    .from(commands)
    .where(inArray(commands.id, steps.map((s) => s.commandId)))
  const cmdById = new Map(cmdRows.map((c) => [c.id, c]))

  const allowed = await scopedServerIds(user)

  // Resolve each step into concrete server targets + interpolated command.
  const snapSteps: {
    node_key: string
    command: string
    interactive: boolean
    target_server_ids: string[]
    continue_on_failure: boolean
  }[] = []

  for (const step of steps) {
    const cmd = cmdById.get(step.commandId)
    if (!cmd) return NextResponse.json({ error: 'Referenced command missing' }, { status: 400 })

    // Expand targets.
    let targets: string[]
    if (step.targetMode === 'group' && step.targetGroupId) {
      const rows = await db
        .select({ id: servers.id })
        .from(servers)
        .where(eq(servers.groupId, step.targetGroupId))
      targets = rows.map((r) => r.id)
    } else {
      targets = step.targetServerIds ?? []
    }
    if (allowed !== null) targets = targets.filter((sid) => allowed.has(sid))
    if (!targets.length) {
      return NextResponse.json(
        { error: `Step "${cmd.name}" has no permitted target servers.` },
        { status: 403 }
      )
    }

    // Interpolate: per-step overrides win over run-wide values.
    const values = { ...runVariables, ...((step.variables as Record<string, string>) ?? {}) }
    let command: string
    try {
      command = interpolate(cmd.command, values, { raw: allowRaw })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }

    snapSteps.push({
      node_key: step.nodeKey,
      command,
      interactive: cmd.interactive,
      target_server_ids: targets,
      continue_on_failure: step.continueOnFailure,
    })
  }

  const snapshot = {
    steps: snapSteps,
    edges: edges.map((e) => ({ from: e.fromNodeKey, to: e.toNodeKey, condition: e.condition })),
  }

  const run = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(chainRuns)
      .values({ chainId: id, graphSnapshot: snapshot, variables: runVariables, createdBy: user.id })
      .returning()

    // One run-step row per (node, server), all pending.
    const rows = snapSteps.flatMap((s) =>
      s.target_server_ids.map((sid) => ({ runId: r.id, nodeKey: s.node_key, serverId: sid }))
    )
    await tx.insert(chainRunSteps).values(rows)
    return r
  })

  await triggerChainAdvance(run.id).catch(() => {}) // sweeper covers a failed publish

  await audit({
    action: 'chain.run',
    actorId: user.id,
    actorEmail: user.email,
    resourceType: 'chain',
    resourceId: id,
    metadata: { runId: run.id, steps: snapSteps.length },
  })

  return NextResponse.json({ run_id: run.id }, { status: 201 })
}
