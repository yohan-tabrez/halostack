import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

const publicPaths = ['/login', '/setup', '/api/setup', '/api/auth']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )

  if (isPublic) {
    if (pathname === '/login' || pathname === '/setup') {
      const session = await auth()
      if (session?.user?.id) {
        return NextResponse.redirect(new URL('/', request.url))
      }
    }
    return NextResponse.next()
  }

  // API key Bearer auth is validated in route handlers (requireSessionOrApiKey).
  if (pathname.startsWith('/api/')) {
    const authz = request.headers.get('authorization')
    if (authz?.toLowerCase().startsWith('bearer ')) {
      return NextResponse.next()
    }
  }

  const session = await auth()
  // Empty id means JWT was revoked (session_version mismatch / user deleted).
  if (!session?.user?.id) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
