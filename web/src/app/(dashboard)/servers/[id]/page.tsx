import { redirect } from 'next/navigation'
import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { getDb, servers, serverGroups, commands } from '@/lib/db'
import { decServerField } from '@halostack/crypto'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { ArrowLeft, Terminal } from 'lucide-react'
import ServerCommandPanel from '@/components/ServerCommandPanel'
import DeleteServerButton from '@/components/DeleteServerButton'
import { auth } from '@/lib/auth'
import { canExecuteCommands, canManageServers, canOpenTerminal } from '@/lib/rbac'
import { isServerInScope } from '@/lib/scope'

export default async function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  if (!(await isServerInScope(session.user, id))) redirect('/servers')
  const db = getDb()

  const [row] = await db
    .select({
      id: servers.id,
      hostname: servers.hostname,
      ipAddress: servers.ipAddress,
      port: servers.port,
      status: servers.status,
      osInfo: servers.osInfo,
      osInfoEnc: servers.osInfoEnc,
      osInfoIv: servers.osInfoIv,
      osInfoTag: servers.osInfoTag,
      encVersion: servers.encVersion,
      lastSeen: servers.lastSeen,
      groupName: serverGroups.name,
    })
    .from(servers)
    .leftJoin(serverGroups, eq(servers.groupId, serverGroups.id))
    .where(eq(servers.id, id))
    .limit(1)

  if (!row) redirect('/servers')

  let osInfo = row.osInfo as Record<string, string> | null
  if (row.encVersion >= 1 && row.osInfoEnc) {
    const dec = decServerField(
      row.osInfoEnc,
      row.osInfoIv,
      row.osInfoTag,
      row.id,
      process.env.MASTER_SECRET ?? '',
      process.env.MASTER_SECRET_PREVIOUS || undefined
    )
    osInfo = dec ? (JSON.parse(dec) as Record<string, string>) : null
  }

  const library = canExecuteCommands(session.user.role)
    ? await db
        .select({ id: commands.id, name: commands.name, command: commands.command })
        .from(commands)
        .orderBy(desc(commands.createdAt))
        .limit(100)
    : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/servers" className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{row.hostname}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{row.status}</Badge>
              <span className="text-sm text-muted-foreground">
                {row.ipAddress}:{row.port}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canOpenTerminal(session.user.role) && (
            <Link href={`/servers/${row.id}/terminal`} className={buttonVariants({ variant: 'outline' })}>
              <Terminal className="mr-2 size-4" aria-hidden="true" />
              Connect Web PTY
            </Link>
          )}
          {canManageServers(session.user.role) && <DeleteServerButton serverId={row.id} />}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        {canExecuteCommands(session.user.role) ? (
          <ServerCommandPanel serverId={row.id} serverStatus={row.status} library={library} />
        ) : (
          <Card className="border-border bg-card p-8 text-sm text-muted-foreground">
            Your role cannot execute commands on this server.
          </Card>
        )}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              System information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Group</div>
              <div>{row.groupName || '—'}</div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">OS</div>
              <div>{osInfo?.uname || 'Unknown'}</div>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Last seen</div>
              <div>{row.lastSeen ? row.lastSeen.toLocaleString() : 'Never'}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
