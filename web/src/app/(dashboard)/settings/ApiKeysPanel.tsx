'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { KeyRound, Loader2, Plus, Trash2, Copy, Check } from 'lucide-react'

type KeyRow = {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
}

export function ApiKeysPanel({ initialKeys = [] }: { initialKeys?: KeyRow[] }) {
  const [keys, setKeys] = useState<KeyRow[]>(initialKeys)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [plaintext, setPlaintext] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  async function refreshKeys() {
    const res = await fetch('/api/settings/api-keys')
    if (!res.ok) {
      setError('Failed to load API keys')
      return
    }
    const data = await res.json()
    setKeys(data.keys ?? [])
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError('')
    setPlaintext(null)
    const res = await fetch('/api/settings/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setCreating(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to create key')
      return
    }
    const data = await res.json()
    setPlaintext(data.key)
    setName('')
    await refreshKeys()
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this API key? Scripts using it will stop working.')) return
    const res = await fetch(`/api/settings/api-keys/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setError('Failed to revoke key')
      return
    }
    if (plaintext) setPlaintext(null)
    await refreshKeys()
  }

  async function copyKey() {
    if (!plaintext) return
    await navigator.clipboard.writeText(plaintext)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="border-b border-border pb-4">
        <CardTitle className="text-base text-white flex items-center gap-2">
          <KeyRound className="size-4 text-primary" /> API Keys
        </CardTitle>
        <CardDescription className="text-muted-foreground text-sm">
          Bearer tokens for <code className="text-foreground">POST /api/jobs</code> and chain runs.
          Same RBAC as your account. Plaintext is shown only once at creation.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">
        <form onSubmit={createKey} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5 flex-1 min-w-[12rem]">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              placeholder="CI deploy"
              className="w-full border rounded-md px-3 py-2 text-sm outline-none bg-background border-input text-white placeholder:text-muted-foreground focus-visible:border-ring"
            />
          </div>
          <Button
            type="submit"
            disabled={creating || !name.trim()}
            size="sm"
            className="bg-primary hover:bg-primary/90 text-white gap-1.5"
          >
            {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Create
          </Button>
        </form>

        {plaintext && (
          <div className="rounded-md border border-amber-500/30 bg-warning/5 p-3 space-y-2">
            <p className="text-xs text-amber-300 font-medium">
              Copy this key now — it will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-foreground break-all bg-background rounded px-2 py-1.5 border border-border">
                {plaintext}
              </code>
              <Button type="button" size="sm" variant="outline" onClick={copyKey} className="shrink-0 border-input">
                {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No active API keys.</p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{k.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {k.prefix}… · created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}` : ' · never used'}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => revoke(k.id)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Revoke"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
