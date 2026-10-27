import { describe, it, expect } from 'vitest'
import { hostsFromPrivateCidr, isRfc1918, ipToInt } from './network-scan'

describe('network-scan CIDR', () => {
  it('accepts a small RFC1918 CIDR and caps hosts', () => {
    const r = hostsFromPrivateCidr('192.168.1.0/28')
    expect('hosts' in r).toBe(true)
    if ('hosts' in r) {
      expect(r.hosts.length).toBeLessThanOrEqual(16)
      expect(r.hosts[0]).toBe('192.168.1.1')
    }
  })

  it('rejects public ranges', () => {
    const r = hostsFromPrivateCidr('8.8.8.0/24')
    expect(r).toEqual({ error: expect.stringMatching(/RFC1918/i) })
  })

  it('detects RFC1918 integers', () => {
    expect(isRfc1918(ipToInt('10.0.0.1')!)).toBe(true)
    expect(isRfc1918(ipToInt('172.16.5.1')!)).toBe(true)
    expect(isRfc1918(ipToInt('8.8.8.8')!)).toBe(false)
  })
})
