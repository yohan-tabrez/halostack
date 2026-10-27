import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { and, eq, ne } from 'drizzle-orm'
import { getDb, users, type UserRole } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canManageUsers } from '@/lib/rbac'
import { revokeUserSessions } from '@/lib/auth'

const VALID_ROLES: UserRole[] = ['global_admin', 'group_admin', 'power_user', 'read_only']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canManageUsers(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { role, email, password } = body ?? {}

  if (!role && !email && !password) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const db = getDb()
  const [target] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)

  if (!target) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  }

  const updates: { role?: UserRole; email?: string; passwordHash?: string } = {}

  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    if (id === user.id && role !== user.role) {
      return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 400 })
    }
    updates.role = role
  }

  if (email !== undefined) {
    if (typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
    }
    if (email !== target.email) {
      const [duplicate] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), ne(users.id, id)))
        .limit(1)
      if (duplicate) {
        return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 })
      }
      updates.email = email
    }
  }

  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }
    updates.passwordHash = await bcrypt.hash(password, 12)
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })

  if (updates.role !== undefined || updates.passwordHash !== undefined) {
    await revokeUserSessions(id)
  }

  return NextResponse.json({ user: updated })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canManageUsers(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (id === user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 })
  }

  const db = getDb()
  await revokeUserSessions(id)
  await db.delete(users).where(eq(users.id, id))
  return NextResponse.json({ success: true })
}
