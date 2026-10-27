import { headers } from 'next/headers'
import { getDb, auditLog } from '@/lib/db'

type AuditEvent = {
  action: string
  actorId?: string | null
  actorEmail?: string | null
  resourceType?: string
  resourceId?: string
  serverId?: string
  groupId?: string
  outcome?: 'success' | 'failure'
  severity?: 'info' | 'warn' | 'alert'
  metadata?: Record<string, unknown>
}

/**
 * Write an audit record. Fire-and-forget with a swallowed rejection — an audit
 * failure must never fail the user's actual request. Callers may `await` it or not.
 */
export async function audit(event: AuditEvent): Promise<void> {
  try {
    let ip: string | null = null
    let ua: string | null = null
    try {
      const h = await headers()
      ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
      ua = h.get('user-agent')
    } catch {
      /* outside a request context */
    }
    await getDb()
      .insert(auditLog)
      .values({
        action: event.action,
        actorId: event.actorId ?? null,
        actorEmail: event.actorEmail ?? null,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        serverId: event.serverId,
        groupId: event.groupId,
        outcome: event.outcome ?? 'success',
        severity: event.severity ?? 'info',
        ipAddress: ip,
        userAgent: ua,
        metadata: event.metadata ?? {},
      })
  } catch (err) {
    console.error('audit write failed:', (err as Error).message)
  }
}
