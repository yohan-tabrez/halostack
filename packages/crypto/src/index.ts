import crypto from 'crypto'

export { validateSecrets } from './validate'

// v1: legacy scrypt defaults (N=16384). v2: hardened. maxmem must be raised or
// scryptSync throws — N=32768,r=8 needs ~33.5MB against Node's 32MB default.
const V2_SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }

// deriveKey is ~100ms under v2 and sits on the hot path of every job and PTY
// connect, so the derived key is cached. Keyed by a hash of the secret, never
// the secret itself.
const keyCache = new Map<string, Buffer>()

export function deriveKey(masterSecret: string, keyVersion = 1): Buffer {
  const cacheKey = `${crypto.createHash('sha256').update(masterSecret).digest('hex')}:${keyVersion}`
  const cached = keyCache.get(cacheKey)
  if (cached) return cached
  const salt = `halostack-v${keyVersion}`
  const key =
    keyVersion >= 2
      ? crypto.scryptSync(masterSecret, salt, 32, V2_SCRYPT)
      : crypto.scryptSync(masterSecret, salt, 32)
  keyCache.set(cacheKey, key)
  return key
}

export function encryptBlob(
  payload: Record<string, unknown>,
  masterSecret: string,
  keyVersion = 1,
  aad?: Buffer
) {
  const key = deriveKey(masterSecret, keyVersion)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  // AAD binds the ciphertext to its row (credential/server id + version), so a
  // blob copied into another row fails the tag check. v1 blobs have no AAD.
  if (aad) cipher.setAAD(aad)
  const jsonString = JSON.stringify(payload)
  const encryptedBlob = Buffer.concat([cipher.update(jsonString, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return { encryptedBlob, iv, authTag, keyVersion }
}

export function decryptBlob(
  encryptedBlob: Buffer,
  iv: Buffer,
  authTag: Buffer,
  masterSecret: string,
  keyVersion = 1,
  previousSecret?: string,
  aad?: Buffer
): Record<string, unknown> {
  const secrets = [masterSecret]
  if (previousSecret) secrets.push(previousSecret)

  let lastError: Error | null = null
  for (const secret of secrets) {
    try {
      const key = deriveKey(secret, keyVersion)
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
      if (aad) decipher.setAAD(aad)
      decipher.setAuthTag(authTag)
      const decryptedString = Buffer.concat([
        decipher.update(encryptedBlob),
        decipher.final(),
      ]).toString('utf8')
      return JSON.parse(decryptedString) as Record<string, unknown>
    } catch (err) {
      lastError = err as Error
    }
  }
  throw lastError ?? new Error('Decryption failed')
}

// Single-value variants for encrypting individual server columns. Same GCM path,
// value wrapped so the JSON round-trip is uniform.
export function encryptValue(value: string, masterSecret: string, keyVersion = 2, aad?: Buffer) {
  return encryptBlob({ v: value }, masterSecret, keyVersion, aad)
}

export function decryptValue(
  encryptedBlob: Buffer,
  iv: Buffer,
  authTag: Buffer,
  masterSecret: string,
  keyVersion = 2,
  previousSecret?: string,
  aad?: Buffer
): string {
  const out = decryptBlob(encryptedBlob, iv, authTag, masterSecret, keyVersion, previousSecret, aad)
  return String(out.v ?? '')
}

/**
 * Deterministic blind index for exact-match lookup / uniqueness on an encrypted
 * column. Keyed by BLIND_INDEX_SECRET (separate from MASTER_SECRET so rotating one
 * doesn't force recomputing the other). Loses substring/prefix search by design.
 *
 * Reserved / optional: product lookups do not use blind indexes yet. Kept for
 * tests and future encrypted-column uniqueness without plaintext indexes.
 */
export function blindIndex(value: string, indexSecret: string): Buffer {
  const normalized = value.trim().toLowerCase()
  return crypto.createHmac('sha256', indexSecret).update(normalized).digest()
}

/** AAD binding a blob to its row: `${id}|${scope}|v${keyVersion}`. */
export function aadFor(id: string, scope: string, keyVersion: number): Buffer {
  return Buffer.from(`${id}|${scope}|v${keyVersion}`, 'utf8')
}

// Encrypt/decrypt an individual server column, bound to the server id. Used for
// os_info and host_key_fingerprint (enc_version >= 1).
export function encServerField(value: string, serverId: string, secret: string) {
  const { encryptedBlob, iv, authTag } = encryptValue(value, secret, 2, aadFor(serverId, 'server', 2))
  return { enc: encryptedBlob, iv, tag: authTag }
}

export function decServerField(
  enc: Buffer | string | null,
  iv: Buffer | string | null,
  tag: Buffer | string | null,
  serverId: string,
  secret: string,
  previousSecret?: string
): string | null {
  if (!enc || !iv || !tag) return null
  return decryptValue(
    bufferFromDb(enc),
    bufferFromDb(iv),
    bufferFromDb(tag),
    secret,
    2,
    previousSecret,
    aadFor(serverId, 'server', 2)
  )
}

export function bufferFromDb(value: Buffer | string): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (typeof value === 'string' && value.startsWith('\\x')) {
    return Buffer.from(value.slice(2), 'hex')
  }
  return Buffer.from(value)
}
