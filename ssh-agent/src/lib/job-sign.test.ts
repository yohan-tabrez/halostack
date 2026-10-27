import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { verifyJobPayload } from './job-sign'

function sign(body: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

describe('verifyJobPayload', () => {
  it('accepts a valid signature', () => {
    const body = JSON.stringify({ job_id: '1', server_id: '2', command: 'uptime' })
    expect(verifyJobPayload(body, sign(body, 'secret'), 'secret')).toBe(true)
  })

  it('rejects a wrong secret (job signature reject)', () => {
    const body = JSON.stringify({ job_id: '1', server_id: '2', command: 'uptime' })
    expect(verifyJobPayload(body, sign(body, 'secret'), 'other')).toBe(false)
  })

  it('rejects tampered body', () => {
    const body = JSON.stringify({ job_id: '1', command: 'uptime' })
    const sig = sign(body, 'secret')
    expect(verifyJobPayload(body + 'x', sig, 'secret')).toBe(false)
  })

  it('returns false on length mismatch instead of throwing', () => {
    expect(verifyJobPayload('body', 'short', 'secret')).toBe(false)
  })
})
