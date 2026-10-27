import { describe, it, expect } from 'vitest'
import { decryptBlob, encryptBlob, encryptValue, decryptValue, blindIndex, aadFor } from './index'

describe('crypto', () => {
  const secret = '0123456789abcdef0123456789abcdef'

  it('round-trips credential payload', () => {
    const payload = {
      ssh_auth_type: 'key',
      ssh_private_key: '-----BEGIN KEY-----',
      sudo_password: 'secret',
    }
    const { encryptedBlob, iv, authTag, keyVersion } = encryptBlob(payload, secret)
    const decrypted = decryptBlob(encryptedBlob, iv, authTag, secret, keyVersion)
    expect(decrypted).toEqual(payload)
  })

  it('decrypts with previous secret during rotation', () => {
    const payload = { ssh_auth_type: 'password', ssh_password: 'x' }
    const oldSecret = 'oldsecretoldsecretoldsecretoldsecre'
    const { encryptedBlob, iv, authTag, keyVersion } = encryptBlob(payload, oldSecret)
    const decrypted = decryptBlob(
      encryptedBlob,
      iv,
      authTag,
      secret,
      keyVersion,
      oldSecret
    )
    expect(decrypted).toEqual(payload)
  })

  it('v2 round-trips with hardened scrypt', () => {
    const payload = { ssh_auth_type: 'key', sudo_password: 's' }
    const strong = 'a'.repeat(40)
    const { encryptedBlob, iv, authTag } = encryptBlob(payload, strong, 2)
    expect(decryptBlob(encryptedBlob, iv, authTag, strong, 2)).toEqual(payload)
  })

  it('AAD binds a blob to its row — transplant fails', () => {
    const strong = 'a'.repeat(40)
    const aadA = aadFor('id-A', 'server', 2)
    const aadB = aadFor('id-B', 'server', 2)
    const { encryptedBlob, iv, authTag } = encryptValue('10.0.0.1', strong, 2, aadA)
    // Correct AAD decrypts; a different row's AAD (transplanted blob) throws.
    expect(decryptValue(encryptedBlob, iv, authTag, strong, 2, undefined, aadA)).toBe('10.0.0.1')
    expect(() => decryptValue(encryptedBlob, iv, authTag, strong, 2, undefined, aadB)).toThrow()
  })

  it('blind index is deterministic and case/space-insensitive', () => {
    const s = 'index-secret'
    expect(blindIndex('Host.Example.com ', s)).toEqual(blindIndex('host.example.com', s))
    expect(blindIndex('a', s)).not.toEqual(blindIndex('b', s))
  })
})
