import { describe, it, expect } from 'vitest'
import { canMutateOwned, canAccessChainRun } from './ownership'
import type { SessionUser } from './rbac'

const admin: SessionUser = { id: 'a', email: 'a@x', role: 'global_admin' }
const owner: SessionUser = { id: 'u1', email: 'u@x', role: 'power_user' }
const other: SessionUser = { id: 'u2', email: 'o@x', role: 'power_user' }

describe('ownership', () => {
  it('lets global_admin mutate any owned object', () => {
    expect(canMutateOwned(admin, 'someone-else')).toBe(true)
    expect(canMutateOwned(admin, null)).toBe(true)
  })

  it('lets creator mutate their own object', () => {
    expect(canMutateOwned(owner, 'u1')).toBe(true)
    expect(canMutateOwned(other, 'u1')).toBe(false)
  })

  it('scopes chain run access to creator or global_admin', () => {
    expect(canAccessChainRun(admin, 'u1')).toBe(true)
    expect(canAccessChainRun(owner, 'u1')).toBe(true)
    expect(canAccessChainRun(other, 'u1')).toBe(false)
  })
})
