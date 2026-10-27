import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { canNetworkScan } from '@/lib/rbac'

export default async function NetworkScanLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canNetworkScan(session.user.role)) redirect('/')
  return children
}
