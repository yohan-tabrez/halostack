import { describe, it, expect } from 'vitest'
import { validateSecrets } from './validate'

const good = {
  MASTER_SECRET: '6t6-_i494zWytOQ0LdlOqoYGuTQ6LSbRdb-DUoetk98',
  BLIND_INDEX_SECRET: 'x'.repeat(32),
  INTERNAL_AGENT_SECRET: 'zA9kLm2pQx7vBn4wRt8yHc5jUf1eGs0d',
  WS_TOKEN_SECRET: 'yB8jKn3oPw6uAm5xQs9zGd4iTe2fHr1c',
} as NodeJS.ProcessEnv

describe('validateSecrets', () => {
  it('accepts strong secrets', () => {
    expect(() => validateSecrets(good)).not.toThrow()
  })

  it('rejects the known default', () => {
    expect(() => validateSecrets({ ...good, MASTER_SECRET: '0123456789abcdef0123456789abcdef' })).toThrow(
      /default/
    )
  })

  it('rejects a short secret', () => {
    expect(() => validateSecrets({ ...good, MASTER_SECRET: 'short' })).toThrow(/32 characters/)
  })

  it('rejects low-entropy secrets', () => {
    expect(() => validateSecrets({ ...good, MASTER_SECRET: 'a'.repeat(40) })).toThrow(/entropy/)
  })

  it('requires BLIND_INDEX_SECRET', () => {
    expect(() => validateSecrets({ ...good, BLIND_INDEX_SECRET: undefined })).toThrow(/BLIND_INDEX_SECRET/)
  })

  it('requires INTERNAL_AGENT_SECRET independently of WS_TOKEN_SECRET', () => {
    expect(() => validateSecrets({ ...good, INTERNAL_AGENT_SECRET: undefined })).toThrow(
      /INTERNAL_AGENT_SECRET/
    )
  })

  it('rejects known-default INTERNAL_AGENT_SECRET', () => {
    expect(() =>
      validateSecrets({ ...good, INTERNAL_AGENT_SECRET: 'super-secret-internal-token-change-in-prod' })
    ).toThrow(/default/)
  })
})
