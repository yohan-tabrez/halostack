import { redirect } from 'next/navigation'
import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { getDb, servers } from '@/lib/db'
import { buttonVariants } from '@/components/ui/button-variants'
import { ArrowLeft, Server } from 'lucide-react'
import WebTerminal from '@/components/WebTerminal'
import { auth } from '@/lib/auth'
import { canOpenTerminal } from '@/lib/rbac'
import { isServerInScope } from '@/lib/scope'

export default async function TerminalPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const { id } = await params
  if (!canOpenTerminal(session.user.role)) redirect(`/servers/${id}`)
  if (!(await isServerInScope(session.user, id))) redirect('/servers')
  const db = getDb()
  const [server] = await db
    .select({ id: servers.id, hostname: servers.hostname, ipAddress: servers.ipAddress, status: servers.status })
    .from(servers)
    .where(eq(servers.id, id))
    .limit(1)

  if (!server) redirect('/servers')

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4">
      <div className="flex items-center gap-4">
        <Link href={`/servers/${server.id}`} className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Server className="size-5 text-muted-foreground" />
            {server.hostname}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{server.ipAddress} · {server.status}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-card border border-border p-1 rounded-lg">
        <WebTerminal serverId={server.id} />
      </div>
    </div>
  )
}
