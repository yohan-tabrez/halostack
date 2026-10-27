import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { SessionUser } from '@/lib/rbac'
import { userFromApiKey } from '@/lib/api-key-auth'

export async function requireSession(): Promise<SessionUser | NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
  }
}

/**
 * Session cookie OR `Authorization: Bearer hs_…` API key.
 * API key auth inherits the owning user's role and RBAC scope.
 */
export async function requireSessionOrApiKey(
  request: Request
): Promise<SessionUser | NextResponse> {
  const header = request.headers.get('authorization')
  if (header?.toLowerCase().startsWith('bearer ')) {
    const raw = header.slice(7).trim()
    const user = await userFromApiKey(raw)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return user
  }
  return requireSession()
}

export function isErrorResponse(value: SessionUser | NextResponse): value is NextResponse {
  return value instanceof NextResponse
}
