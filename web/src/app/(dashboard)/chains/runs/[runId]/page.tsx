import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { canExecuteCommands } from '@/lib/rbac'
import ChainRunView from '@/components/chains/ChainRunView'

export default async function ChainRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canExecuteCommands(session.user.role)) redirect('/')
  const { runId } = await params
  return <ChainRunView runId={runId} />
}
