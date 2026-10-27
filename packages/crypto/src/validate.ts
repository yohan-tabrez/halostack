// Boot-time secret validation. MUST be called from app entrypoints only, never at
// module load — scripts/reencrypt.js imports this package and has to run WITH the
// weak secret still in MASTER_SECRET. Enforcing at import would make the migration
// that fixes a weak secret impossible to perform.

const DENYLIST = new Set([
  '0123456789abcdef0123456789abcdef',
  'dev-auth-secret-change-in-production-min32chars',
  'change-me-to-a-random-string-at-least-32-chars',
  'super-secret-internal-token-change-in-prod',
])

function shannonEntropy(s: string): number {
  const counts = new Map<string, number>()
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let bits = 0
  for (const c of counts.values()) {
    const p = c / s.length
    bits -= p * Math.log2(p)
  }
  return bits
}

function checkSecret(name: string, value: string, problems: string[]): void {
  if (!value) {
    problems.push(`${name} is required`)
    return
  }
  if (value.length < 32) problems.push(`${name} must be at least 32 characters`)
  if (DENYLIST.has(value)) problems.push(`${name} is a known default — generate a random one`)
  if (value.length >= 32 && shannonEntropy(value) < 3.5)
    problems.push(`${name} has low entropy — use random bytes, not a phrase`)
}

/** Throws with an actionable message if the crypto secrets are unsafe. */
export function validateSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const problems: string[] = []

  checkSecret('MASTER_SECRET', env.MASTER_SECRET ?? '', problems)
  if (!env.BLIND_INDEX_SECRET) problems.push('BLIND_INDEX_SECRET is required')
  // Job HMAC must never be optional — an empty INTERNAL_AGENT_SECRET lets anyone
  // who can write to Redis enqueue unsigned SSH jobs.
  checkSecret('INTERNAL_AGENT_SECRET', env.INTERNAL_AGENT_SECRET ?? '', problems)
  // WS tokens may fall back to INTERNAL_AGENT_SECRET; if set explicitly, validate too.
  if (env.WS_TOKEN_SECRET) checkSecret('WS_TOKEN_SECRET', env.WS_TOKEN_SECRET, problems)

  if (problems.length) {
    throw new Error(
      `Refusing to start — unsafe secrets:\n  - ${problems.join(
        '\n  - '
      )}\nRotate with: MASTER_SECRET_NEW=<strong> node scripts/reencrypt.js`
    )
  }
}
