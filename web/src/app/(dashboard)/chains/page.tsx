import { redirect } from 'next/navigation'
import { desc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { getDb, chains } from '@/lib/db'
import { canExecuteCommands } from '@/lib/rbac'
import ChainsList from '@/components/chains/ChainsList'

export default async function ChainsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canExecuteCommands(session.user.role)) redirect('/')

  const list = await getDb().select().from(chains).orderBy(desc(chains.createdAt))
  return <ChainsList chains={list} />
}
