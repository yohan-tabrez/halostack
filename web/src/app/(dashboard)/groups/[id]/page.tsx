import { redirect } from 'next/navigation'
import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { getDb, serverGroups, servers, commands } from '@/lib/db'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { ArrowLeft, Server } from 'lucide-react'
import GroupCommandExecutor from '@/components/GroupCommandExecutor'
import { auth } from '@/lib/auth'
import { canExecuteCommands } from '@/lib/rbac'

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const db = getDb()

  const [group] = await db.select().from(serverGroups).where(eq(serverGroups.id, id)).limit(1)
  if (!group) redirect('/groups')

  const groupServers = await db.select().from(servers).where(eq(servers.groupId, id))
  const onlineCount = groupServers.filter(
    (s) => s.status === 'reachable' || s.status === 'unknown'
  ).length

  const library = canExecuteCommands(session.user.role)
    ? await db
        .select({ id: commands.id, name: commands.name, command: commands.command })
        .from(commands)
        .orderBy(desc(commands.createdAt))
        .limit(100)
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/groups" className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{group.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {groupServers.length} servers ({onlineCount} reachable)
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        {canExecuteCommands(session.user.role) ? (
          <GroupCommandExecutor groupId={group.id} onlineCount={onlineCount} library={library} />
        ) : (
          <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
            Your role cannot execute group commands.
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
          {groupServers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No servers in this group.</p>
          ) : (
            groupServers.map((server) => (
              <div key={server.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Server className="size-3 text-muted-foreground" aria-hidden="true" />
                    <Link href={`/servers/${server.id}`} className="hover:text-primary">
                      {server.hostname}
                    </Link>
                  </div>
                  <div className="text-xs text-muted-foreground">{server.ipAddress}</div>
                </div>
                <Badge variant="secondary">{server.status}</Badge>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
