import { describe, it, expect } from 'vitest'
import { interpolate, extractVariables } from './interpolate'

describe('interpolate', () => {
  it('extracts declared variables', () => {
    expect(extractVariables('restart {{svc}} on {{host}} {{svc}}')).toEqual(['svc', 'host'])
  })

  it('shell-quotes values so they cannot inject', () => {
    const out = interpolate('echo {{msg}}', { msg: '; rm -rf / #' })
    expect(out).toBe(`echo '; rm -rf / #'`)
  })

  it('escapes embedded single quotes', () => {
    expect(interpolate('echo {{m}}', { m: "a'b" })).toBe(`echo 'a'\\''b'`)
  })

  it('throws on a missing value', () => {
    expect(() => interpolate('echo {{x}}', {})).toThrow(/Missing value/)
  })

  it('raw mode skips quoting (admin opt-out)', () => {
    expect(interpolate('run {{flag}}', { flag: '--verbose' }, { raw: true })).toBe('run --verbose')
  })
})
