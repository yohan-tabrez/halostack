import { NextResponse } from 'next/server'
import { desc } from 'drizzle-orm'
import { getDb, commands } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canExecuteCommands } from '@/lib/rbac'
import { extractVariables } from '@/lib/interpolate'

// Server-independent command library. Chains and per-server bindings reference these.
export async function GET() {
  const user = await requireSession()
  if (isErrorResponse(user)) return user

  const db = getDb()
  const list = await db.select().from(commands).orderBy(desc(commands.createdAt))
  return NextResponse.json({ commands: list })
}

export async function POST(request: Request) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canExecuteCommands(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, command, description, interactive } = body ?? {}
  if (!name?.trim() || !command?.trim()) {
    return NextResponse.json({ error: 'Name and command are required.' }, { status: 400 })
  }

  const db = getDb()
  const [created] = await db
    .insert(commands)
    .values({
      name: name.trim(),
      command: command.trim(),
      description: description?.trim() || null,
      // Declared variables are derived from the template — one source of truth.
      variables: extractVariables(command),
      interactive: Boolean(interactive),
      createdBy: user.id,
    })
    .returning()

  return NextResponse.json({ command: created }, { status: 201 })
}
