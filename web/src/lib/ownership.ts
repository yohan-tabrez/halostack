import type { SessionUser } from '@/lib/rbac'

/** Creator or global_admin may mutate shared library objects (commands, chains). */
export function canMutateOwned(user: SessionUser, createdBy: string | null | undefined): boolean {
  if (user.role === 'global_admin') return true
  return Boolean(createdBy && createdBy === user.id)
}

/** Creator, global_admin, or (for runs) anyone who can execute and owns the run. */
export function canAccessChainRun(user: SessionUser, createdBy: string | null | undefined): boolean {
  if (user.role === 'global_admin') return true
  return Boolean(createdBy && createdBy === user.id)
}
