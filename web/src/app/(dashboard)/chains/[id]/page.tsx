import { redirect } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { getDb, chains, chainSteps, chainEdges, commands, servers, serverGroups } from '@/lib/db'
import { canExecuteCommands } from '@/lib/rbac'
import ChainCanvas from '@/components/chains/ChainCanvas'

export default async function ChainEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canExecuteCommands(session.user.role)) redirect('/')

  const { id } = await params
  const db = getDb()
  const [chain] = await db.select().from(chains).where(eq(chains.id, id)).limit(1)
  if (!chain) redirect('/chains')

  const [steps, edges, cmdList, serverList, groupList] = await Promise.all([
    db.select().from(chainSteps).where(eq(chainSteps.chainId, id)),
    db.select().from(chainEdges).where(eq(chainEdges.chainId, id)),
    db.select().from(commands).orderBy(asc(commands.name)),
    db.select({ id: servers.id, hostname: servers.hostname }).from(servers).orderBy(asc(servers.hostname)),
    db.select({ id: serverGroups.id, name: serverGroups.name }).from(serverGroups).orderBy(asc(serverGroups.name)),
  ])

  return (
    <ChainCanvas
      chain={chain}
      initialSteps={steps}
      initialEdges={edges}
      commands={cmdList}
      servers={serverList}
      groups={groupList}
    />
  )
}
