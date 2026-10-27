import { NextResponse } from 'next/server'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { getDb, apiKeys } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { generateApiKey } from '@/lib/api-key-auth'
import { audit } from '@/lib/audit'
import { internalError } from '@/lib/api-error'

export async function GET() {
  try {
    const user = await requireSession()
    if (isErrorResponse(user)) return user

    const rows = await getDb()
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)))
      .orderBy(desc(apiKeys.createdAt))

    return NextResponse.json({
      keys: rows.map((r) => ({
        id: r.id,
        name: r.name,
        prefix: r.prefix,
        createdAt: r.createdAt.toISOString(),
        lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      })),
    })
  } catch (error) {
    return internalError('Failed to list API keys', error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSession()
    if (isErrorResponse(user)) return user

    const body = await request.json().catch(() => ({}))
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 80) {
      return NextResponse.json({ error: 'name is required (max 80 chars)' }, { status: 400 })
    }

    const { raw, prefix, keyHash } = generateApiKey()
    const [row] = await getDb()
      .insert(apiKeys)
      .values({ userId: user.id, name, keyHash, prefix })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        createdAt: apiKeys.createdAt,
      })

    await audit({
      action: 'api_key.create',
      actorId: user.id,
      actorEmail: user.email,
      resourceType: 'api_key',
      resourceId: row.id,
      metadata: { name, prefix },
    })

    // Plaintext key returned once — never stored or listed again.
    return NextResponse.json(
      {
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        createdAt: row.createdAt.toISOString(),
        key: raw,
      },
      { status: 201 }
    )
  } catch (error) {
    return internalError('Failed to create API key', error)
  }
}
