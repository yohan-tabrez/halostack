import crypto from 'crypto'
import type { Client as SSHClient } from 'ssh2'

export function fingerprintHostKey(key: Buffer): string {
  return crypto.createHash('sha256').update(key).digest('base64')
}

export function verifyHostKey(
  presentedKey: Buffer,
  pinnedFingerprint: string | null
): { ok: boolean; fingerprint: string; isNew: boolean } {
  const fingerprint = fingerprintHostKey(presentedKey)
  if (!pinnedFingerprint) {
    return { ok: true, fingerprint, isNew: true }
  }
  return {
    ok: fingerprint === pinnedFingerprint,
    fingerprint,
    isNew: false,
  }
}

export type PooledConnection = {
  conn: SSHClient
  lastUsed: number
  serverId: string
  /** Active leases; idle eviction and peer evict skip while > 0. */
  refCount: number
  /** Evict requested while leased — tear down on last release. */
  dead?: boolean
}
