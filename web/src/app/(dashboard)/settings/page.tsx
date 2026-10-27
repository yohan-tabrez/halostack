import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { getDb, users, serverGroups, userGroupMemberships, apiKeys } from '@/lib/db'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ShieldCheck, Users } from 'lucide-react'
import { ChangePasswordForm, UserManagementTable } from './SettingsClient'
import { ApiKeysPanel } from './ApiKeysPanel'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { role, email, id } = session.user
  const isAdmin = role === 'global_admin'
  const db = getDb()

  const keyRows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, id), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt))

  let allUsers: { id: string; email: string; role: string; createdAt: Date; groupIds: string[] }[] = []
  let groups: { id: string; name: string }[] = []
  if (isAdmin) {
    const [userRows, groupRows, memberships] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          role: users.role,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt)),
      db.select({ id: serverGroups.id, name: serverGroups.name }).from(serverGroups).orderBy(asc(serverGroups.name)),
      db.select().from(userGroupMemberships),
    ])
    groups = groupRows
    const byUser = new Map<string, string[]>()
    for (const m of memberships) {
      const arr = byUser.get(m.userId) ?? []
      arr.push(m.groupId)
      byUser.set(m.userId, arr)
    }
    allUsers = userRows.map((u) => ({ ...u, groupIds: byUser.get(u.id) ?? [] }))
  }

  const ROLE_LABELS: Record<string, string> = {
    global_admin: 'Global Admin',
    group_admin: 'Group Admin',
    power_user: 'Power User',
    read_only: 'Read Only',
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground mt-1 text-sm">Manage your account and application settings.</p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> Account
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm">Your profile and authentication settings.</CardDescription>
        </CardHeader>
        <CardContent className="pt-5 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Email address</div>
              <div className="text-sm font-medium text-white">{email}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Role</div>
              <div className="text-sm font-medium text-white">{ROLE_LABELS[role] ?? role}</div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-white mb-3">Change Password</h3>
            <ChangePasswordForm />
          </div>
        </CardContent>
      </Card>

      <ApiKeysPanel
        initialKeys={keyRows.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        }))}
      />

      {isAdmin && (
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Users className="size-4 text-primary" /> User Management
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              Add, edit, and remove HALOStack users. Assign groups for group_admin scoping.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            <UserManagementTable
              initialUsers={allUsers.map((u) => ({
                ...u,
                createdAt: u.createdAt.toISOString(),
              }))}
              currentUserId={id}
              groups={groups}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
