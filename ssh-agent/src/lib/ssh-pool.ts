import { Client as SSHClient } from 'ssh2'
import type { PooledConnection } from './host-key'

const pool = new Map<string, PooledConnection>()
const idleTimeoutMs = Number(process.env.SSH_POOL_IDLE_TIMEOUT_MS ?? 300000)

function isIdleExpired(entry: PooledConnection, now = Date.now()): boolean {
  return entry.refCount === 0 && !entry.dead && now - entry.lastUsed > idleTimeoutMs
}

/** Peek at a pooled connection without leasing. Does not idle-evict leased entries. */
export function getPooledConnection(serverId: string): PooledConnection | undefined {
  const entry = pool.get(serverId)
  if (!entry || entry.dead) return undefined
  if (isIdleExpired(entry)) {
    entry.conn.end()
    pool.delete(serverId)
    return undefined
  }
  entry.lastUsed = Date.now()
  return entry
}

/** Lease a pooled connection so idle eviction / other jobs' evict won't tear it down. */
export function acquireConnection(serverId: string): PooledConnection | undefined {
  const entry = pool.get(serverId)
  if (!entry || entry.dead) return undefined
  if (isIdleExpired(entry)) {
    entry.conn.end()
    pool.delete(serverId)
    return undefined
  }
  entry.refCount++
  entry.lastUsed = Date.now()
  return entry
}

/** Drop a lease. Finishes a deferred eviction when the last holder releases. */
export function releaseConnection(serverId: string) {
  const entry = pool.get(serverId)
  if (!entry) return
  entry.refCount = Math.max(0, entry.refCount - 1)
  entry.lastUsed = Date.now()
  if (entry.refCount === 0 && entry.dead) {
    try {
      entry.conn.end()
    } catch {
      /* already closed */
    }
    pool.delete(serverId)
  }
}

export function setPooledConnection(serverId: string, conn: SSHClient) {
  const existing = pool.get(serverId)
  pool.set(serverId, {
    conn,
    lastUsed: Date.now(),
    serverId,
    refCount: existing?.refCount ?? 0,
    dead: false,
  })
}

/** End/remove a connection. If leased, mark dead and tear down on last release. */
export function evictConnection(serverId: string) {
  const entry = pool.get(serverId)
  if (!entry) return
  if (entry.refCount > 0) {
    entry.dead = true
    return
  }
  try {
    entry.conn.end()
  } catch {
    /* already closed */
  }
  pool.delete(serverId)
}

export function poolSize() {
  return pool.size
}

setInterval(() => {
  const now = Date.now()
  for (const [serverId, entry] of pool.entries()) {
    if (isIdleExpired(entry, now)) {
      entry.conn.end()
      pool.delete(serverId)
    }
  }
}, 60_000)
