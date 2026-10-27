import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { mintWsToken } from '@/lib/ws-token'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = await mintWsToken(session.user.id)
  const wsUrl = process.env.WS_PUBLIC_URL ?? 'ws://localhost:8080'
  return NextResponse.json({ token, wsUrl })
}
