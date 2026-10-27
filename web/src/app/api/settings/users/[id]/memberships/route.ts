import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getDb, userGroupMemberships, serverGroups, users } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canManageUsers } from '@/lib/rbac'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireSession()
  if (isErrorResponse(actor)) return actor
  if (!canManageUsers(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()
  const rows = await db
    .select({
      groupId: userGroupMemberships.groupId,
      groupName: serverGroups.name,
    })
    .from(userGroupMemberships)
    .innerJoin(serverGroups, eq(serverGroups.id, userGroupMemberships.groupId))
    .where(eq(userGroupMemberships.userId, id))

  return NextResponse.json({ memberships: rows })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireSession()
  if (isErrorResponse(actor)) return actor
  if (!canManageUsers(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const groupIds: string[] = Array.isArray(body?.groupIds)
    ? body.groupIds.filter((g: unknown) => typeof g === 'string')
    : []

  const db = getDb()
  const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).limit(1)
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (groupIds.length) {
    const existing = await db.select({ id: serverGroups.id }).from(serverGroups)
    const valid = new Set(existing.map((g) => g.id))
    if (groupIds.some((g) => !valid.has(g))) {
      return NextResponse.json({ error: 'Invalid group id' }, { status: 400 })
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(userGroupMemberships).where(eq(userGroupMemberships.userId, id))
    if (groupIds.length) {
      await tx.insert(userGroupMemberships).values(groupIds.map((groupId) => ({ userId: id, groupId })))
    }
  })

  const { revokeUserSessions } = await import('@/lib/auth')
  await revokeUserSessions(id)

  return NextResponse.json({ success: true, groupIds })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireSession()
  if (isErrorResponse(actor)) return actor
  if (!canManageUsers(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const groupId = typeof body?.groupId === 'string' ? body.groupId : null
  if (!groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 400 })

  const db = getDb()
  const [group] = await db.select({ id: serverGroups.id }).from(serverGroups).where(eq(serverGroups.id, groupId)).limit(1)
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  await db
    .insert(userGroupMemberships)
    .values({ userId: id, groupId })
    .onConflictDoNothing()

  return NextResponse.json({ success: true }, { status: 201 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireSession()
  if (isErrorResponse(actor)) return actor
  if (!canManageUsers(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const groupId = request.nextUrl.searchParams.get('groupId')
  if (!groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 400 })

  const db = getDb()
  await db
    .delete(userGroupMemberships)
    .where(and(eq(userGroupMemberships.userId, id), eq(userGroupMemberships.groupId, groupId)))

  return NextResponse.json({ success: true })
}
