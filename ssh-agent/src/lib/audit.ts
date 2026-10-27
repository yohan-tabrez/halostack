import { getDb, auditLog } from './db'

// Agent-side audit writer for the security alerts the designdoc names (host key
// mismatch, sudo failure). Fire-and-forget — never let an audit failure break a job.
export async function audit(event: {
  action: string
  serverId?: string
  outcome?: 'success' | 'failure'
  severity?: 'info' | 'warn' | 'alert'
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await getDb()
      .insert(auditLog)
      .values({
        action: event.action,
        serverId: event.serverId,
        outcome: event.outcome ?? 'success',
        severity: event.severity ?? 'info',
        metadata: event.metadata ?? {},
      })
  } catch (err) {
    console.error('agent audit write failed:', (err as Error).message)
  }
}
