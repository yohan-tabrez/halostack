import { createHash, randomBytes } from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb, apiKeys, users } from '@/lib/db'
import type { SessionUser } from '@/lib/rbac'

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** Generate a key shown once: `hs_` + 32 random bytes hex. Prefix is first 11 chars. */
export function generateApiKey(): { raw: string; prefix: string; keyHash: string } {
  const raw = `hs_${randomBytes(32).toString('hex')}`
  return { raw, prefix: raw.slice(0, 11), keyHash: hashApiKey(raw) }
}

/** Resolve Bearer hs_… key to the owning user, or null. Updates last_used_at. */
export async function userFromApiKey(raw: string): Promise<SessionUser | null> {
  if (!raw.startsWith('hs_') || raw.length < 20) return null
  const keyHash = hashApiKey(raw)
  const db = getDb()
  const [row] = await db
    .select({
      keyId: apiKeys.id,
      userId: users.id,
      email: users.email,
      role: users.role,
    })
    .from(apiKeys)
    .innerJoin(users, eq(users.id, apiKeys.userId))
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1)
  if (!row) return null
  // Fire-and-forget last-used stamp
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.keyId))
    .catch(() => {})
  return { id: row.userId, email: row.email, role: row.role }
}
