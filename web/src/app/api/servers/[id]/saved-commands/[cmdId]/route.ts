import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getDb, savedCommands } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canExecuteCommands } from '@/lib/rbac'
import { isServerInScope } from '@/lib/scope'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cmdId: string }> }
) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canExecuteCommands(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, cmdId } = await params
  if (!(await isServerInScope(user, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, command, description } = body ?? {}

  if (!name?.trim() || !command?.trim()) {
    return NextResponse.json({ error: 'Name and command are required.' }, { status: 400 })
  }

  const db = getDb()
  const [updated] = await db
    .update(savedCommands)
    .set({
      name: name.trim(),
      command: command.trim(),
      description: description?.trim() || null,
    })
    .where(and(eq(savedCommands.id, cmdId), eq(savedCommands.serverId, id)))
    .returning()

  return NextResponse.json({ command: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; cmdId: string }> }
) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canExecuteCommands(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, cmdId } = await params
  if (!(await isServerInScope(user, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = getDb()
  await db
    .delete(savedCommands)
    .where(and(eq(savedCommands.id, cmdId), eq(savedCommands.serverId, id)))

  return NextResponse.json({ success: true })
}
