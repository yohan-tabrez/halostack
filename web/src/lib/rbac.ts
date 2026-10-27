import type { UserRole } from '@halostack/db'

export type SessionUser = {
  id: string
  email: string
  role: UserRole
}

export function canManageServers(role: UserRole) {
  return role === 'global_admin' || role === 'group_admin'
}

export function canExecuteCommands(role: UserRole) {
  return role === 'global_admin' || role === 'group_admin' || role === 'power_user'
}

export function canManageUsers(role: UserRole) {
  return role === 'global_admin'
}

export function canViewAudit(role: UserRole) {
  return role === 'global_admin'
}

export function canOpenTerminal(role: UserRole) {
  return role === 'global_admin' || role === 'power_user'
}

export function canManageSettings(role: UserRole) {
  return role === 'global_admin'
}

export function canNetworkScan(role: UserRole) {
  return role === 'global_admin'
}

export function navItemsForRole(role: UserRole) {
  const items = [
    { href: '/', label: 'Dashboard', show: true },
    { href: '/commands', label: 'Library', show: canExecuteCommands(role) },
    { href: '/chains', label: 'Chains', show: canExecuteCommands(role) },
    { href: '/servers', label: 'Servers', show: true },
    { href: '/groups', label: 'Groups', show: true },
    { href: '/jobs', label: 'History', show: canExecuteCommands(role) },
    { href: '/network-scan', label: 'Network Scan', show: canNetworkScan(role) },
    { href: '/audit', label: 'Audit Log', show: canViewAudit(role) },
    { href: '/settings', label: 'Settings', show: true },
  ]
  return items.filter((i) => i.show)
}
