'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Loader2, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import CommandRunBar, { type LibraryPick } from '@/components/CommandRunBar'

interface BoundCommand {
  id: string
  name: string
  command: string
  description?: string | null
  commandId?: string | null
}

export default function ServerCommandPanel({
  serverId,
  serverStatus,
  library,
}: {
  serverId: string
  serverStatus: string
  library: LibraryPick[]
}) {
  const [tab, setTab] = useState<'run' | 'bound'>('run')
  const [bound, setBound] = useState<BoundCommand[]>([])
  const [loadingBound, setLoadingBound] = useState(true)
  const [runningId, setRunningId] = useState<string | null>(null)
  const isOnline = serverStatus === 'reachable' || serverStatus === 'unknown'

  const fetchBound = useCallback(() => {
    setLoadingBound(true)
    fetch(`/api/servers/${serverId}/saved-commands`)
      .then((r) => r.json())
      .then((d) => setBound(d.commands ?? []))
      .catch(console.error)
      .finally(() => setLoadingBound(false))
  }, [serverId])

  useEffect(() => {
    fetchBound()
  }, [fetchBound])

  async function deleteBound(id: string) {
    setBound((prev) => prev.filter((c) => c.id !== id))
    await fetch(`/api/servers/${serverId}/saved-commands/${id}`, { method: 'DELETE' })
  }

  async function runBound(cmd: BoundCommand) {
    if (!isOnline) return
    setRunningId(cmd.id)
    setTab('run')
    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_id: serverId, command: cmd.command }),
      })
    } finally {
      setRunningId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {(['run', 'bound'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 cursor-pointer rounded-md py-1.5 text-sm font-medium transition-colors ${
              tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'bound' ? `Bound (${bound.length})` : 'Run'}
          </button>
        ))}
      </div>

      {tab === 'run' ? (
        <CommandRunBar mode="server" serverId={serverId} serverStatus={serverStatus} library={library} />
      ) : (
        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Bound commands</CardTitle>
                <CardDescription className="mt-0.5">
                  Library templates bound to this server. Manage the catalog in Library.
                </CardDescription>
              </div>
              <Link href="/commands">
                <Button type="button" size="sm" variant="outline">
                  <BookOpen className="size-3.5" aria-hidden="true" /> Library
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingBound ? (
              <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading…
              </div>
            ) : bound.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <BookOpen className="mb-3 size-9 text-muted-foreground/50" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">No bindings yet</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Open Library, create a command, and bind it to this server.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {bound.map((sc) => (
                  <li key={sc.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">{sc.name}</div>
                      <code className="block truncate font-mono text-xs text-muted-foreground" title={sc.command}>
                        {sc.command}
                      </code>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!isOnline || runningId === sc.id}
                        onClick={() => runBound(sc)}
                      >
                        {runningId === sc.id ? (
                          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <Play className="size-3" aria-hidden="true" />
                        )}
                        Run
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteBound(sc.id)}
                        aria-label={`Unbind ${sc.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
