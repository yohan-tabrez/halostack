import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, serverGroups } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSession()
    if (isErrorResponse(user)) return user
    if (user.role !== 'global_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const db = getDb()
    await db.delete(serverGroups).where(eq(serverGroups.id, id))
    return NextResponse.json({ success: true })
  } catch (error) {
    const err = error as Error
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
