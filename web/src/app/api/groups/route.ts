import { NextResponse } from 'next/server'
import { asc } from 'drizzle-orm'
import { getDb, serverGroups } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canManageServers } from '@/lib/rbac'

export async function POST(request: Request) {
  try {
    const user = await requireSession()
    if (isErrorResponse(user)) return user
    if (!canManageServers(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name } = await request.json()
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 })
    }

    const db = getDb()
    const [group] = await db
      .insert(serverGroups)
      .values({ name: name.trim(), createdBy: user.id })
      .returning()

    return NextResponse.json({ group }, { status: 201 })
  } catch (error) {
    const err = error as Error
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET() {
  const user = await requireSession()
  if (isErrorResponse(user)) return user

  const db = getDb()
  const groups = await db.select().from(serverGroups).orderBy(asc(serverGroups.name))
  return NextResponse.json({ groups })
}
