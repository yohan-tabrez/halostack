import { asc, count, eq } from 'drizzle-orm'
import { getDb, serverGroups, servers } from '@/lib/db'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { PageHeader } from '@/components/PageHeader'
import { Plus, Users, Settings2, Server } from 'lucide-react'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { canManageServers } from '@/lib/rbac'
import { redirect } from 'next/navigation'

export default async function GroupsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const db = getDb()
  const groups = await db.select().from(serverGroups).orderBy(asc(serverGroups.name))

  const groupsWithCounts = await Promise.all(
    groups.map(async (group) => {
      const [row] = await db
        .select({ value: count() })
        .from(servers)
        .where(eq(servers.groupId, group.id))
      return { ...group, serverCount: row?.value ?? 0 }
    })
  )

  const canAdd = canManageServers(session.user.role)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Server groups"
        description="Organise infrastructure for bulk operations."
        actions={
          canAdd ? (
            <Link href="/groups/add" className={buttonVariants()}>
              <Plus className="mr-2 size-4" aria-hidden="true" />
              New group
            </Link>
          ) : undefined
        }
      />

      <Card className="overflow-hidden border-border bg-card">
        <CardContent className="p-0">
          {!groupsWithCounts.length ? (
            <div className="flex flex-col items-center justify-center p-14 text-center">
              <Users className="mb-4 size-6 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-base font-semibold text-foreground">No groups yet</h3>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {groupsWithCounts.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center gap-4">
                    <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <h4 className="font-medium text-foreground">{group.name}</h4>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Server className="size-3" aria-hidden="true" />
                        {group.serverCount} servers
                      </p>
                    </div>
                  </div>
                  <Link href={`/groups/${group.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                    <Settings2 className="mr-2 size-3.5" aria-hidden="true" />
                    Manage
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
