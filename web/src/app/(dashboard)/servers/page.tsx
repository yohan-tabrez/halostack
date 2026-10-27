import { desc, eq, inArray } from 'drizzle-orm'
import { getDb, servers, serverGroups } from '@/lib/db'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { PageHeader } from '@/components/PageHeader'
import { Plus, Server, Terminal, Wifi, WifiOff, Activity } from 'lucide-react'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { canManageServers } from '@/lib/rbac'
import { scopedServerIds } from '@/lib/scope'
import { redirect } from 'next/navigation'

function StatusDot({ status }: { status: string }) {
  if (status === 'reachable') {
    return (
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
    )
  }
  if (status === 'unreachable') return <span className="inline-flex size-2 rounded-full bg-destructive" />
  return <span className="inline-flex size-2 rounded-full bg-warning" />
}

export default async function ServersPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const db = getDb()
  const allowed = await scopedServerIds(session.user)

  let query = db
    .select({
      id: servers.id,
      hostname: servers.hostname,
      ipAddress: servers.ipAddress,
      port: servers.port,
      status: servers.status,
      groupName: serverGroups.name,
    })
    .from(servers)
    .leftJoin(serverGroups, eq(servers.groupId, serverGroups.id))
    .orderBy(desc(servers.createdAt))
    .$dynamic()

  if (allowed !== null) {
    if (!allowed.size) {
      query = query.where(inArray(servers.id, ['00000000-0000-0000-0000-000000000000']))
    } else {
      query = query.where(inArray(servers.id, [...allowed]))
    }
  }

  const rows = await query
  const online = rows.filter((s) => s.status === 'reachable').length
  const total = rows.length
  const canAdd = canManageServers(session.user.role)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servers"
        description={total === 0 ? 'No servers registered yet.' : `${online} / ${total} reachable`}
        actions={
          canAdd ? (
            <Link href="/servers/add" className={buttonVariants()}>
              <Plus className="mr-2 size-4" aria-hidden="true" />
              Add server
            </Link>
          ) : undefined
        }
      />

      <Card className="overflow-hidden border-border bg-card">
        <CardContent className="p-0">
          {!rows.length ? (
            <div className="flex flex-col items-center justify-center p-14 text-center">
              <Server className="mb-4 size-6 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-base font-semibold text-foreground">No servers yet</h3>
              {canAdd ? (
                <Link href="/servers/add" className={buttonVariants({ className: 'mt-6', size: 'sm' })}>
                  Add your first server
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((server) => (
                <div
                  key={server.id}
                  className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-muted ring-1 ring-border">
                      {server.status === 'reachable' ? (
                        <Wifi className="size-4 text-success" aria-hidden="true" />
                      ) : server.status === 'unreachable' ? (
                        <WifiOff className="size-4 text-destructive" aria-hidden="true" />
                      ) : (
                        <Activity className="size-4 text-warning" aria-hidden="true" />
                      )}
                    </div>
                    <div>
                      <h4 className="flex flex-wrap items-center gap-2.5 font-medium text-foreground">
                        {server.hostname}
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <StatusDot status={server.status} />
                          {server.status}
                        </span>
                        {server.groupName ? (
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {server.groupName}
                          </span>
                        ) : null}
                      </h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {server.ipAddress}:{server.port}
                      </p>
                    </div>
                  </div>
                  <Link href={`/servers/${server.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                    <Terminal className="mr-2 size-3.5" aria-hidden="true" />
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
