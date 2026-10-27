import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, commands } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canExecuteCommands } from '@/lib/rbac'
import { extractVariables } from '@/lib/interpolate'
import { canMutateOwned } from '@/lib/ownership'
import { internalError } from '@/lib/api-error'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  const { id } = await params
  const [row] = await getDb().select().from(commands).where(eq(commands.id, id)).limit(1)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ command: row })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canExecuteCommands(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const db = getDb()
  const [existing] = await db.select().from(commands).where(eq(commands.id, id)).limit(1)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canMutateOwned(user, existing.createdBy)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, command, description, interactive } = body ?? {}
  if (!name?.trim() || !command?.trim()) {
    return NextResponse.json({ error: 'Name and command are required.' }, { status: 400 })
  }

  const [updated] = await db
    .update(commands)
    .set({
      name: name.trim(),
      command: command.trim(),
      description: description?.trim() || null,
      variables: extractVariables(command),
      interactive: Boolean(interactive),
      updatedAt: new Date(),
    })
    .where(eq(commands.id, id))
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ command: updated })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canExecuteCommands(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  const db = getDb()
  const [existing] = await db.select().from(commands).where(eq(commands.id, id)).limit(1)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!canMutateOwned(user, existing.createdBy)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const [deleted] = await db.delete(commands).where(eq(commands.id, id)).returning()
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes('violates foreign key') || msg.includes('foreign key constraint')) {
      return NextResponse.json(
        { error: 'Command is in use by a chain or server and cannot be deleted.' },
        { status: 409 }
      )
    }
    return internalError('Delete command', e)
  }
}
