import { NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb, apiKeys } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { audit } from '@/lib/audit'
import { internalError } from '@/lib/api-error'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession()
    if (isErrorResponse(user)) return user

    const { id } = await params
    const db = getDb()
    const [row] = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix })

    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await audit({
      action: 'api_key.revoke',
      actorId: user.id,
      actorEmail: user.email,
      resourceType: 'api_key',
      resourceId: row.id,
      metadata: { name: row.name, prefix: row.prefix },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return internalError('Failed to revoke API key', error)
  }
}
