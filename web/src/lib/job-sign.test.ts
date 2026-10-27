import { describe, it, expect } from 'vitest'
import { signJobPayload, verifyJobPayload } from './job-sign'

describe('job-sign', () => {
  it('signs and verifies payloads', () => {
    const payload = { job_id: '1', server_id: '2', command: 'uptime' }
    const { body, signature } = signJobPayload(payload, 'secret')
    expect(verifyJobPayload(body, signature, 'secret')).toBe(true)
    expect(verifyJobPayload(body, signature, 'wrong')).toBe(false)
  })

  it('returns false (not throw) on a wrong-length signature', () => {
    // Regression: timingSafeEqual throws RangeError on length mismatch.
    expect(verifyJobPayload('body', 'deadbeef', 'secret')).toBe(false)
    expect(verifyJobPayload('body', '', 'secret')).toBe(false)
  })
})
