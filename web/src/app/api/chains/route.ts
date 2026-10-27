import { NextResponse } from 'next/server'
import { desc } from 'drizzle-orm'
import { getDb, chains, chainSteps, chainEdges } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canExecuteCommands } from '@/lib/rbac'
import { hasCycle } from '@/lib/chain-graph'

export async function GET() {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  const list = await getDb().select().from(chains).orderBy(desc(chains.createdAt))
  return NextResponse.json({ chains: list })
}

export async function POST(request: Request) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canExecuteCommands(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, description, graph, steps = [], edges = [] } = body ?? {}
  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  }
  if (hasCycle(steps, edges)) {
    return NextResponse.json({ error: 'Chain graph contains a cycle.' }, { status: 400 })
  }

  const db = getDb()
  const chain = await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(chains)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        graph: graph ?? {},
        createdBy: user.id,
      })
      .returning()

    if (steps.length) {
      await tx.insert(chainSteps).values(
        steps.map((s: Record<string, unknown>) => ({
          chainId: c.id,
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
          chainId: c.id,
          fromNodeKey: e.from as string,
          toNodeKey: e.to as string,
          condition: (e.condition as string) ?? 'on_success',
        }))
      )
    }
    return c
  })

  return NextResponse.json({ chain }, { status: 201 })
}
