import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import DashboardShell from '@/components/DashboardShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  return (
    <DashboardShell email={session.user.email} role={session.user.role}>
      {children}
    </DashboardShell>
  )
}
