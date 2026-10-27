'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Network, Loader2, ShieldAlert } from 'lucide-react'

type Result = { host: string; open: boolean }

export default function NetworkScanPage() {
  const [cidr, setCidr] = useState('192.168.1.0/28')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)

  async function runScan(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResults(null)
    setNote('')
    const res = await fetch('/api/network-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cidr }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setError(data.error || 'Scan failed')
      return
    }
    setNote(data.note ?? '')
    setResults(data.results ?? [])
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Network Scan</h2>
        <p className="text-sm text-muted-foreground mt-1">Admin-only RFC1918 TCP :22 probe (hard-capped).</p>
      </div>

      <Card className="border-warning/20 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-amber-300 flex items-center gap-2">
            <ShieldAlert className="size-4" /> Danger
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm leading-relaxed">
            This probes hosts on your network. Only private (RFC1918) CIDRs are allowed. At most{' '}
            <strong className="text-foreground">16 hosts</strong>, <strong className="text-foreground">1s</strong>{' '}
            timeout each, TCP port <strong className="text-foreground">22</strong> only — not a full port scan.
            Unauthorized scanning may violate policy or law. Prefer running nmap yourself when you need real discovery.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="border-b border-border pb-4">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <Network className="size-4 text-primary" /> Probe CIDR
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <form onSubmit={runScan} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5 flex-1 min-w-[14rem]">
              <label className="text-xs font-medium text-muted-foreground">CIDR (RFC1918)</label>
              <input
                value={cidr}
                onChange={(e) => setCidr(e.target.value)}
                required
                placeholder="10.0.0.0/28"
                className="w-full border rounded-md px-3 py-2 text-sm font-mono outline-none bg-background border-input text-white placeholder:text-muted-foreground focus-visible:border-ring"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              size="sm"
              className="bg-primary hover:bg-primary/90 text-white gap-1.5"
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Run probe
            </Button>
          </form>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {note && <p className="text-xs text-muted-foreground">{note}</p>}

          {results && (
            <div className="divide-y divide-border rounded-md border border-border">
              {results.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No hosts probed.</p>
              ) : (
                results.map((r) => (
                  <div key={r.host} className="flex items-center justify-between px-3 py-2 text-sm">
                    <code className="font-mono text-foreground">{r.host}</code>
                    <span className={r.open ? 'text-primary' : 'text-muted-foreground'}>
                      {r.open ? 'port 22 open' : 'closed / filtered'}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
