import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { canExecuteCommands } from '@/lib/rbac'
import { scopedServerIds } from '@/lib/scope'
import CommandLibrary, { type LibraryCommand, type ServerOption } from '@/components/CommandLibrary'

export const dynamic = 'force-dynamic'

export default async function CommandsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canExecuteCommands(session.user.role)) redirect('/')

  const { getDb, commands, servers } = await import('@/lib/db')
  const { desc, asc, inArray } = await import('drizzle-orm')
  const db = getDb()
  const allowed = await scopedServerIds(session.user)

  const [libraryRows, serverList] = await Promise.all([
    db.select().from(commands).orderBy(desc(commands.createdAt)),
    allowed === null
      ? db
          .select({ id: servers.id, hostname: servers.hostname, status: servers.status })
          .from(servers)
          .orderBy(asc(servers.hostname))
      : allowed.size
        ? db
            .select({ id: servers.id, hostname: servers.hostname, status: servers.status })
            .from(servers)
            .where(inArray(servers.id, [...allowed]))
            .orderBy(asc(servers.hostname))
        : Promise.resolve([] as ServerOption[]),
  ])

  const mapped: LibraryCommand[] = libraryRows.map((c) => ({
    id: c.id,
    name: c.name,
    command: c.command,
    description: c.description,
    variables: c.variables,
    interactive: c.interactive,
    createdAt: c.createdAt.toISOString(),
  }))

  return <CommandLibrary initialCommands={mapped} servers={serverList} />
}
