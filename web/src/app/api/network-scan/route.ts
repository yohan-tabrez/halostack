import { NextResponse } from 'next/server'
import { requireSession, isErrorResponse } from '@/lib/session'
import { rateLimit } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'
import { hostsFromPrivateCidr, probeSshHosts, NETWORK_SCAN_CAPS } from '@/lib/network-scan'
import { internalError } from '@/lib/api-error'

export async function POST(request: Request) {
  try {
    const user = await requireSession()
    if (isErrorResponse(user)) return user
    if (user.role !== 'global_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { success } = await rateLimit(user.id, 3, 60, 'network-scan')
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    const cidr = typeof body?.cidr === 'string' ? body.cidr.trim() : ''
    if (!cidr) return NextResponse.json({ error: 'cidr is required' }, { status: 400 })

    const parsed = hostsFromPrivateCidr(cidr)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    await audit({
      action: 'network.scan',
      actorId: user.id,
      actorEmail: user.email,
      severity: 'warn',
      metadata: {
        cidr,
        hostCount: parsed.hosts.length,
        caps: NETWORK_SCAN_CAPS,
      },
    })

    const results = await probeSshHosts(parsed.hosts)

    return NextResponse.json({
      cidr,
      note: 'Limited TCP :22 connect probe only — not a full nmap. Use nmap externally for real discovery.',
      caps: NETWORK_SCAN_CAPS,
      results,
    })
  } catch (error) {
    return internalError('Network scan failed', error)
  }
}
