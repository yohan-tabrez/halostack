import { WebSocket } from 'ws'
import { jwtVerify } from 'jose'

// Must match web/src/lib/ws-token.ts
const WS_AUDIENCE = 'halostack-ws'
const WS_SCOPE = 'jobs:subscribe'

type JobSubscriber = {
  ws: WebSocket
  userId: string
  role: string
  groupIds: Set<string>
}

const subscribers = new Set<JobSubscriber>()

export function addJobSubscriber(sub: JobSubscriber) {
  subscribers.add(sub)
  sub.ws.on('close', () => subscribers.delete(sub))
}

export function broadcastJobUpdate(update: {
  job_id: string
  server_id: string
  issued_by: string | null
  group_id: string | null
  status: string
  stdout?: string | null
  stderr?: string | null
  exit_code?: number | null
  awaiting_prompt?: string | null
}) {
  const message = JSON.stringify({ type: 'job_update', ...update })
  for (const sub of subscribers) {
    if (sub.ws.readyState !== WebSocket.OPEN) continue
    const isOwner = update.issued_by && sub.userId === update.issued_by
    const inGroup = update.group_id && sub.groupIds.has(update.group_id)
    const isGlobalAdmin = sub.role === 'global_admin'
    if (isOwner || inGroup || isGlobalAdmin) {
      sub.ws.send(message)
    }
  }
}

/**
 * Verifies the purpose-built WS token minted by the web tier (see web/src/lib/ws-token.ts).
 *
 * This is NOT the Auth.js session cookie. Auth.js issues an encrypted JWE, which
 * jwtVerify cannot parse at all — it only handles signed JWS. Verifying the session
 * cookie here would mean reimplementing Auth.js's HKDF key derivation and tracking
 * its internals forever, so the web tier mints a token for this purpose instead.
 */
export async function validateSessionToken(token: string): Promise<{ userId: string } | null> {
  const secret = process.env.WS_TOKEN_SECRET || process.env.INTERNAL_AGENT_SECRET
  if (!secret) return null
  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key, {
      audience: WS_AUDIENCE,
      // Pin the algorithm: without this, jose honours whatever alg the token names.
      algorithms: ['HS256'],
    })
    if (payload.scope !== WS_SCOPE) return null
    const userId = payload.sub
    if (!userId || typeof userId !== 'string') return null
    return { userId }
  } catch {
    return null
  }
}
