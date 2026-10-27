import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, chains, chainSteps, chainEdges } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canExecuteCommands } from '@/lib/rbac'
import { hasCycle } from '@/lib/chain-graph'
import { canMutateOwned } from '@/lib/ownership'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  const { id } = await params
  const db = getDb()
  const [chain] = await db.select().from(chains).where(eq(chains.id, id)).limit(1)
  if (!chain) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [steps, edges] = await Promise.all([
    db.select().from(chainSteps).where(eq(chainSteps.chainId, id)),
    db.select().from(chainEdges).where(eq(chainEdges.chainId, id)),
  ])
  return NextResponse.json({ chain, steps, edges })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canExecuteCommands(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const db = getDb()
  const [existing] = await db.select().from(chains).where(eq(chains.id, id)).limit(1)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canMutateOwned(user, existing.createdBy)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, description, graph, steps = [], edges = [] } = body ?? {}
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  if (hasCycle(steps, edges)) {
    return NextResponse.json({ error: 'Chain graph contains a cycle.' }, { status: 400 })
  }

  await db.transaction(async (tx) => {
    await tx
      .update(chains)
      .set({ name: name.trim(), description: description?.trim() || null, graph: graph ?? {}, updatedAt: new Date() })
      .where(eq(chains.id, id))
    await tx.delete(chainSteps).where(eq(chainSteps.chainId, id))
    await tx.delete(chainEdges).where(eq(chainEdges.chainId, id))
    if (steps.length) {
      await tx.insert(chainSteps).values(
        steps.map((s: Record<string, unknown>) => ({
          chainId: id,
          nodeKey: s.nodeKey as string,
          commandId: s.commandId as string,
          targetMode: (s.targetMode as string) ?? 'servers',
          targetServerIds: (s.targetServerIds as string[]) ?? [],
          targetGroupId: (s.targetGroupId as string | null) ?? null,
          variables: (s.variables as Record<string, string>) ?? {},
          continueOnFailure: Boolean(s.continueOnFailure),
        }))
      )
    }
    if (edges.length) {
      await tx.insert(chainEdges).values(
        edges.map((e: Record<string, unknown>) => ({
          chainId: id,
          fromNodeKey: e.from as string,
          toNodeKey: e.to as string,
          condition: (e.condition as string) ?? 'on_success',
        }))
      )
    }
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canExecuteCommands(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const db = getDb()
  const [existing] = await db.select().from(chains).where(eq(chains.id, id)).limit(1)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canMutateOwned(user, existing.createdBy)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await db.delete(chains).where(eq(chains.id, id))
  return NextResponse.json({ success: true })
}
