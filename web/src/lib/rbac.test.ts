import { describe, it, expect } from 'vitest'
import {
  canExecuteCommands,
  canManageServers,
  canViewAudit,
  canNetworkScan,
  navItemsForRole,
} from './rbac'

describe('rbac', () => {
  it('allows power_user to execute commands', () => {
    expect(canExecuteCommands('power_user')).toBe(true)
  })

  it('blocks read_only from executing commands', () => {
    expect(canExecuteCommands('read_only')).toBe(false)
  })

  it('hides commands nav for read_only', () => {
    const items = navItemsForRole('read_only')
    expect(items.some((i: { href: string }) => i.href === '/commands')).toBe(false)
  })

  it('allows group_admin to manage servers', () => {
    expect(canManageServers('group_admin')).toBe(true)
  })

  it('restricts audit to global_admin only', () => {
    expect(canViewAudit('global_admin')).toBe(true)
    expect(canViewAudit('group_admin')).toBe(false)
    expect(canViewAudit('power_user')).toBe(false)
    expect(canViewAudit('read_only')).toBe(false)
  })

  it('hides audit nav for non-admins', () => {
    expect(navItemsForRole('power_user').some((i) => i.href === '/audit')).toBe(false)
    expect(navItemsForRole('global_admin').some((i) => i.href === '/audit')).toBe(true)
  })

  it('restricts network scan to global_admin', () => {
    expect(canNetworkScan('global_admin')).toBe(true)
    expect(canNetworkScan('group_admin')).toBe(false)
    expect(navItemsForRole('global_admin').some((i) => i.href === '/network-scan')).toBe(true)
    expect(navItemsForRole('power_user').some((i) => i.href === '/network-scan')).toBe(false)
  })
})

