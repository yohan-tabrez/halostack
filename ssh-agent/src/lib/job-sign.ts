import crypto from 'crypto'

export function verifyJobPayload(body: string, signature: string, secret: string) {
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on length mismatch; length isn't secret here.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
