import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { getDb, users } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'

export async function POST(request: Request) {
  const user = await requireSession()
  if (isErrorResponse(user)) return user

  const { currentPassword, newPassword } = await request.json()
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 400 })
  }

  const db = getDb()
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  if (!row) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const valid = await bcrypt.compare(currentPassword, row.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id))

  return NextResponse.json({ success: true })
}
