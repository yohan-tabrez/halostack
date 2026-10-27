import { describe, it, expect } from 'vitest'
import type { SessionUser } from './rbac'

/**
 * Pure mirror of the role branch in scopedServerIds — unrestricted roles return
 * null (no filter). Integration with DB memberships is covered elsewhere.
 */
function unrestrictedScope(role: SessionUser['role']): boolean {
  return role === 'global_admin' || role === 'power_user' || role === 'read_only'
}

describe('scope roles', () => {
  it('treats global_admin and power_user as unrestricted', () => {
    expect(unrestrictedScope('global_admin')).toBe(true)
    expect(unrestrictedScope('power_user')).toBe(true)
    expect(unrestrictedScope('read_only')).toBe(true)
  })

  it('confines group_admin to membership-based scope', () => {
    expect(unrestrictedScope('group_admin')).toBe(false)
  })
})
