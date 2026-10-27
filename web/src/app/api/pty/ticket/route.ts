import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { getDb, servers } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canOpenTerminal } from '@/lib/rbac'
import { isServerInScope } from '@/lib/scope'
import { internalError } from '@/lib/api-error'
import { ensureRedis } from '@/lib/redis'

export async function POST(request: Request) {
  try {
    const user = await requireSession()
    if (isErrorResponse(user)) return user
    if (!canOpenTerminal(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { server_id } = await request.json()
    if (!server_id) {
      return NextResponse.json({ error: 'server_id is required' }, { status: 400 })
    }

    if (!(await isServerInScope(user, server_id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const db = getDb()
    const [server] = await db.select({ id: servers.id }).from(servers).where(eq(servers.id, server_id)).limit(1)
    if (!server) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    }

    const ticket = randomBytes(32).toString('hex')
    const redis = await ensureRedis()
    await redis.set(
      `pty_ticket:${ticket}`,
      JSON.stringify({ server_id, user_id: user.id }),
      'EX',
      60
    )

    return NextResponse.json({ ticket }, { status: 201 })
  } catch (error) {
    return internalError('PTY ticket', error)
  }
}
