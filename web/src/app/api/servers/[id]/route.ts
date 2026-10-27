import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, servers } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canManageServers } from '@/lib/rbac'
import { isServerInScope } from '@/lib/scope'
import { unscheduleServerHealth } from '@/lib/queue'
import { audit } from '@/lib/audit'
import { internalError } from '@/lib/api-error'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSession()
    if (isErrorResponse(user)) return user
    if (!canManageServers(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!(await isServerInScope(user, id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const db = getDb()
    await db.delete(servers).where(eq(servers.id, id))
    await unscheduleServerHealth(id).catch((e) =>
      console.error('Failed to unschedule health check:', e)
    )
    await audit({
      action: 'server.delete',
      actorId: user.id,
      actorEmail: user.email,
      resourceType: 'server',
      resourceId: id,
      severity: 'warn',
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return internalError('Delete server', error)
  }
}
