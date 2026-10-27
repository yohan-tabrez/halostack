import { eq, inArray } from 'drizzle-orm'
import { getDb, servers, userGroupMemberships } from '@/lib/db'
import type { SessionUser } from '@/lib/rbac'

/**
 * Which servers a user may target for command execution.
 *
 * global_admin and power_user are unrestricted (power_user's design role is
 * "execute anywhere, can't manage servers"). group_admin is confined to servers
 * in their assigned groups — the hole this closes: /api/jobs previously loaded
 * any server/group with only a role check. read_only never reaches here
 * (canExecuteCommands blocks it upstream).
 *
 * Returns null when unrestricted, otherwise the set of allowed server ids.
 */
export async function scopedServerIds(user: SessionUser): Promise<Set<string> | null> {
  // global_admin / power_user: unrestricted. read_only may view all (cannot execute).
  // group_admin: confined to assigned groups.
  if (user.role === 'global_admin' || user.role === 'power_user' || user.role === 'read_only') {
    return null
  }

  const db = getDb()
  const memberships = await db
    .select({ groupId: userGroupMemberships.groupId })
    .from(userGroupMemberships)
    .where(eq(userGroupMemberships.userId, user.id))
  const groupIds = memberships.map((m) => m.groupId)
  if (!groupIds.length) return new Set()

  const rows = await db
    .select({ id: servers.id })
    .from(servers)
    .where(inArray(servers.groupId, groupIds))
  return new Set(rows.map((r) => r.id))
}

/** True if the user may target this server. */
export async function isServerInScope(user: SessionUser, serverId: string): Promise<boolean> {
  const allowed = await scopedServerIds(user)
  return allowed === null || allowed.has(serverId)
}
