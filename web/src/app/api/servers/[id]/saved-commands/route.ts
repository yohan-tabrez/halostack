import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq } from 'drizzle-orm'
import { getDb, savedCommands, commands } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canExecuteCommands } from '@/lib/rbac'
import { isServerInScope } from '@/lib/scope'
import { extractVariables } from '@/lib/interpolate'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canExecuteCommands(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (!(await isServerInScope(user, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = getDb()
  const list = await db
    .select()
    .from(savedCommands)
    .where(eq(savedCommands.serverId, id))
    .orderBy(asc(savedCommands.createdAt))

  return NextResponse.json({ commands: list })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canExecuteCommands(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (!(await isServerInScope(user, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, command, description, command_id: commandId } = body ?? {}
  const db = getDb()

  // Bind an existing library command to this server
  if (commandId) {
    const [lib] = await db.select().from(commands).where(eq(commands.id, commandId)).limit(1)
    if (!lib) return NextResponse.json({ error: 'Library command not found.' }, { status: 404 })

    const [existing] = await db
      .select()
      .from(savedCommands)
      .where(and(eq(savedCommands.serverId, id), eq(savedCommands.commandId, commandId)))
      .limit(1)
    if (existing) {
      return NextResponse.json({ command: existing, already_bound: true })
    }

    const [saved] = await db
      .insert(savedCommands)
      .values({
        serverId: id,
        commandId: lib.id,
        name: lib.name,
        command: lib.command,
        description: lib.description,
        createdBy: user.id,
      })
      .returning()

    return NextResponse.json({ command: saved }, { status: 201 })
  }

  if (!name?.trim() || !command?.trim()) {
    return NextResponse.json({ error: 'Name and command are required.' }, { status: 400 })
  }

  // Create library entry then bind — one source of truth
  const [lib] = await db
    .insert(commands)
    .values({
      name: name.trim(),
      command: command.trim(),
      description: description?.trim() || null,
      variables: extractVariables(command),
      createdBy: user.id,
    })
    .returning()

  const [saved] = await db
    .insert(savedCommands)
    .values({
      serverId: id,
      commandId: lib.id,
      name: lib.name,
      command: lib.command,
      description: lib.description,
      createdBy: user.id,
    })
    .returning()

  return NextResponse.json({ command: saved, library: lib }, { status: 201 })
}
