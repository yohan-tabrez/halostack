import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { desc, eq } from 'drizzle-orm'
import { getDb, users, type UserRole } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canManageUsers } from '@/lib/rbac'

const VALID_ROLES: UserRole[] = ['global_admin', 'group_admin', 'power_user', 'read_only']

export async function GET() {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canManageUsers(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = getDb()
  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))

  return NextResponse.json({ users: allUsers })
}

export async function POST(request: NextRequest) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user
  if (!canManageUsers(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { email, password, role } = body ?? {}

  if (!email || !password || !role) {
    return NextResponse.json({ error: 'Email, password, and role are required.' }, { status: 400 })
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }

  const db = getDb()
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const [created] = await db
    .insert(users)
    .values({ email, passwordHash, role })
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })

  return NextResponse.json({ user: created }, { status: 201 })
}
