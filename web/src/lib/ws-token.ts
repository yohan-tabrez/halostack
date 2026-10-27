import { SignJWT } from 'jose'

export const WS_AUDIENCE = 'halostack-ws'
export const WS_SCOPE = 'jobs:subscribe'

/**
 * Purpose-built token for the SSH Agent's WebSocket server.
 *
 * Deliberately NOT the Auth.js session cookie: Auth.js issues an encrypted JWE
 * whose key is HKDF-derived, which the agent cannot verify without reimplementing
 * Auth.js internals. This is a plain HS256 JWS the agent can verify with a shared
 * secret, so the agent stays decoupled from the web tier's auth library.
 *
 * Carries no role/group claims on purpose — the agent reads those from the
 * database on connect, so authz can't go stale inside a token.
 */
function signingKey() {
  const secret = process.env.WS_TOKEN_SECRET || process.env.INTERNAL_AGENT_SECRET
  if (!secret) {
    throw new Error('WS_TOKEN_SECRET or INTERNAL_AGENT_SECRET is required to mint WS tokens')
  }
  return new TextEncoder().encode(secret)
}

export async function mintWsToken(userId: string) {
  return new SignJWT({ scope: WS_SCOPE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience(WS_AUDIENCE)
    .setIssuedAt()
    // Only consumed at connect time, so a short life costs nothing.
    .setExpirationTime('60s')
    .sign(signingKey())
}
