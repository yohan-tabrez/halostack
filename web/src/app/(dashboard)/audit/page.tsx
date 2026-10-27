import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { desc } from 'drizzle-orm'
import { getDb, auditLog } from '@/lib/db'
import { canViewAudit } from '@/lib/rbac'
import AuditClient, { type AuditEntry } from './AuditClient'

export default async function AuditPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canViewAudit(session.user.role)) redirect('/')

  const db = getDb()
  const entries = await db.select().from(auditLog).orderBy(desc(auditLog.occurredAt)).limit(100)

  const mapped: AuditEntry[] = entries.map((e) => ({
    id: e.id,
    action: e.action,
    actorEmail: e.actorEmail,
    outcome: e.outcome,
    severity: e.severity,
    occurredAt: e.occurredAt.toISOString(),
  }))

  return <AuditClient entries={mapped} />
}
