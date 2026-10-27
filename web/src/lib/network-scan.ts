import net from 'net'

const MAX_HOSTS = 16
const CONNECT_TIMEOUT_MS = 1000

/** IPv4 dotted-quad → unsigned 32-bit. */
export function ipToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = (n << 8) | v
  }
  return n >>> 0
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

/** True if address is in 10/8, 172.16/12, or 192.168/16. */
export function isRfc1918(ipInt: number): boolean {
  const a = (ipInt >>> 24) & 255
  const b = (ipInt >>> 16) & 255
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

/**
 * Parse CIDR, require the whole range sits in RFC1918, return up to 16 host IPs
 * (skips network/broadcast when prefix < 31).
 */
export function hostsFromPrivateCidr(cidr: string): { hosts: string[] } | { error: string } {
  const m = cidr.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/)
  if (!m) return { error: 'CIDR must look like 192.168.1.0/24' }
  const base = ipToInt(m[1])
  const prefix = Number(m[2])
  if (base === null || prefix < 8 || prefix > 32) {
    return { error: 'Invalid CIDR (prefix must be 8–32)' }
  }
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  const network = (base & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  if (!isRfc1918(network) || !isRfc1918(broadcast)) {
    return { error: 'CIDR must be entirely within RFC1918 private space' }
  }

  const hosts: string[] = []
  if (prefix >= 31) {
    // /31 and /32: every address is a host
    for (let i = network; i <= broadcast && hosts.length < MAX_HOSTS; i++) {
      hosts.push(intToIp(i))
    }
  } else {
    for (let i = network + 1; i < broadcast && hosts.length < MAX_HOSTS; i++) {
      hosts.push(intToIp(i))
    }
  }
  if (!hosts.length) return { error: 'CIDR expands to no probeable hosts' }
  return { hosts }
}

function probeTcp22(host: string): Promise<{ host: string; open: boolean }> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false
    const done = (open: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ host, open })
    }
    socket.setTimeout(CONNECT_TIMEOUT_MS)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(22, host)
  })
}

/** Probe TCP :22 on up to 16 hosts (1s timeout each). Sequential to stay gentle. */
export async function probeSshHosts(hosts: string[]): Promise<{ host: string; open: boolean }[]> {
  const slice = hosts.slice(0, MAX_HOSTS)
  const results: { host: string; open: boolean }[] = []
  for (const host of slice) {
    results.push(await probeTcp22(host))
  }
  return results
}

export const NETWORK_SCAN_CAPS = { maxHosts: MAX_HOSTS, timeoutMs: CONNECT_TIMEOUT_MS }
