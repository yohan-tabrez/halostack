'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Info, Search, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/PageHeader'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type AuditEntry = {
  id: number
  action: string
  actorEmail: string | null
  outcome: string
  severity: string
  occurredAt: string
}

export default function AuditClient({ entries }: { entries: AuditEntry[] }) {
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState('all')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return entries.filter((e) => {
      const matchSeverity = severity === 'all' || e.severity === severity
      const matchSearch =
        !q ||
        e.action.toLowerCase().includes(q) ||
        (e.actorEmail ?? '').toLowerCase().includes(q) ||
        e.outcome.toLowerCase().includes(q)
      return matchSeverity && matchSearch
    })
  }, [entries, search, severity])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Security-relevant events: sign-ins, command execution, server changes, and alerts."
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search action or actor…"
            className="pl-9"
            aria-label="Search audit log"
          />
        </div>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Filter by severity"
        >
          <option value="all">All severities</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="alert">Alert</option>
        </select>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-lg">Recent activity</CardTitle>
          <CardDescription>Newest first, last 100 events{filtered.length !== entries.length ? ` · showing ${filtered.length}` : ''}.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!filtered.length ? (
            <div className="flex flex-col items-center justify-center border-t border-border p-12 text-center">
              <ShieldAlert className="mb-4 size-6 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-lg font-medium text-foreground">No matching records</h3>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      {e.severity === 'alert' ? (
                        <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
                      ) : e.severity === 'warn' ? (
                        <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                      ) : (
                        <Info className="size-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </TableCell>
                    <TableCell>
                      <code className="font-mono text-xs">{e.action}</code>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{e.actorEmail || 'System'}</TableCell>
                    <TableCell>
                      <span className={e.outcome === 'failure' ? 'text-destructive' : 'text-success'}>
                        {e.outcome}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(e.occurredAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
