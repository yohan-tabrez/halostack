'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Workflow, Plus, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/PageHeader'

type Chain = { id: string; name: string; description: string | null }

export default function ChainsList({ chains }: { chains: Chain[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    const res = await fetch('/api/chains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    const body = await res.json().catch(() => ({}))
    setCreating(false)
    if (!res.ok) return setError(body?.error ?? 'Create failed')
    router.push(`/chains/${body.chain.id}`)
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this chain?')) return
    const res = await fetch(`/api/chains/${id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
    else setError('Delete failed')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chains"
        description="Run multiple Library commands as one flow — each step waits for its predecessors."
      />

      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="New chain name…"
          aria-label="New chain name"
        />
        <Button type="button" onClick={create} disabled={creating || !name.trim()}>
          {creating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
          Create
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {chains.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-14 text-center">
          <Workflow className="mb-3 size-6 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-base font-medium text-foreground">No chains yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create one above, then pick commands from the Library for each step.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {chains.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/40">
              <Link href={`/chains/${c.id}`} className="min-w-0 flex-1">
                <div className="font-medium text-foreground">{c.name}</div>
                {c.description ? <div className="text-xs text-muted-foreground">{c.description}</div> : null}
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => remove(c.id)}
                aria-label={`Delete ${c.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
