import crypto from 'crypto'

export function signJobPayload(payload: Record<string, unknown>, secret: string) {
  const body = JSON.stringify(payload)
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return { body, signature }
}

export function verifyJobPayload(body: string, signature: string, secret: string) {
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  // timingSafeEqual throws RangeError on a length mismatch rather than returning
  // false, so a truncated signature would surface as a crash, not a rejection.
  // Length is not a secret here — the expected digest is always 64 hex chars.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
