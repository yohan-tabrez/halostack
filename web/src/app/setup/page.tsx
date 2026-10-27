import { redirect } from 'next/navigation'
import { count } from 'drizzle-orm'
import { getDb, users } from '@/lib/db'
import SetupForm from './SetupForm'

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  const db = getDb()
  const [result] = await db.select({ value: count() }).from(users)

  if ((result?.value ?? 0) > 0) {
    redirect('/login')
  }

  return <SetupForm />
}
