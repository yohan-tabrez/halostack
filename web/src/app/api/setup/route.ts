import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { count, sql } from 'drizzle-orm'
import { getDb, users } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const [result] = await db.select({ value: count() }).from(users)
  return NextResponse.json({ configured: (result?.value ?? 0) > 0 })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { email, password } = body ?? {}

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400 }
    )
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const db = getDb()

  try {
    // Serialize bootstrap so concurrent POSTs cannot create multiple global_admins.
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(872014)`)
      const [existing] = await tx.select({ value: count() }).from(users)
      if ((existing?.value ?? 0) > 0) {
        throw new Error('SETUP_COMPLETE')
      }
      await tx.insert(users).values({
        email,
        passwordHash,
        role: 'global_admin',
      })
    })
  } catch (err) {
    if ((err as Error).message === 'SETUP_COMPLETE') {
      return NextResponse.json(
        { error: 'Setup is already complete. Please sign in.' },
        { status: 409 }
      )
    }
    console.error('Setup failed:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
