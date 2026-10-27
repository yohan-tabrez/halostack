import { redirect } from 'next/navigation'
import { count } from 'drizzle-orm'
import { getDb, users } from '@/lib/db'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>
}) {
  const db = getDb()
  const [result] = await db.select({ value: count() }).from(users)

  if ((result?.value ?? 0) === 0) {
    redirect('/setup')
  }

  const params = await searchParams
  return <LoginForm setupComplete={params.setup === 'complete'} />
}
