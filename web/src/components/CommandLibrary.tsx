'use client'

import { useMemo, useState } from 'react'
import { Check, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/PageHeader'
import { toFriendlyJobError } from '@/lib/job-errors'

export type LibraryCommand = {
  id: string
  name: string
  command: string
  description: string | null
  variables: unknown
  interactive: boolean
  createdAt: string
}

export type ServerOption = {
  id: string
  hostname: string
  status: string
}

export default function CommandLibrary({
  initialCommands,
  servers,
}: {
  initialCommands: LibraryCommand[]
  servers: ServerOption[]
}) {
  const [commands, setCommands] = useState(initialCommands)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCmd, setNewCmd] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newInteractive, setNewInteractive] = useState(false)
  const [bindServerId, setBindServerId] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCmd, setEditCmd] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editInteractive, setEditInteractive] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const [bindRowId, setBindRowId] = useState<string | null>(null)
  const [bindTarget, setBindTarget] = useState('')
  const [isBinding, setIsBinding] = useState(false)
  const [bindMsg, setBindMsg] = useState<string | null>(null)

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return commands
    return commands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.command.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q)
    )
  }, [commands, search])

  async function createCommand() {
    if (!newName.trim() || !newCmd.trim()) return
    setIsCreating(true)
    setFormError(null)
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          command: newCmd.trim(),
          description: newDesc.trim() || null,
          interactive: newInteractive,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create')

      const created: LibraryCommand = {
        ...data.command,
        createdAt:
          typeof data.command.createdAt === 'string'
            ? data.command.createdAt
            : new Date(data.command.createdAt).toISOString(),
      }

      if (bindServerId) {
        const bindRes = await fetch(`/api/servers/${bindServerId}/saved-commands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command_id: created.id }),
        })
        if (!bindRes.ok) {
          const bindData = await bindRes.json()
          throw new Error(bindData.error ?? 'Created, but bind failed')
        }
      }

      setCommands((prev) => [created, ...prev])
      setShowCreate(false)
      setNewName('')
      setNewCmd('')
      setNewDesc('')
      setNewInteractive(false)
      setBindServerId('')
    } catch (err) {
      setFormError(toFriendlyJobError(err instanceof Error ? err.message : 'Failed to create'))
    } finally {
      setIsCreating(false)
    }
  }

  function startEdit(cmd: LibraryCommand) {
    setEditingId(cmd.id)
    setEditName(cmd.name)
    setEditCmd(cmd.command)
    setEditDesc(cmd.description ?? '')
    setEditInteractive(cmd.interactive)
    setFormError(null)
  }

  async function saveEdit(id: string) {
    if (!editName.trim() || !editCmd.trim()) return
    setIsSavingEdit(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/commands/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          command: editCmd.trim(),
          description: editDesc.trim() || null,
          interactive: editInteractive,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setCommands((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                name: data.command.name,
                command: data.command.command,
                description: data.command.description,
                interactive: data.command.interactive,
                variables: data.command.variables,
              }
            : c
        )
      )
      setEditingId(null)
    } catch (err) {
      setFormError(toFriendlyJobError(err instanceof Error ? err.message : 'Failed to save'))
    } finally {
      setIsSavingEdit(false)
    }
  }

  async function deleteCommand(id: string) {
    if (!confirm('Delete this library command? Chains that use it will block deletion.')) return
    try {
      const res = await fetch(`/api/commands/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete')
      setCommands((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      setFormError(toFriendlyJobError(err instanceof Error ? err.message : 'Failed to delete'))
    }
  }

  async function bindToServer(commandId: string) {
    if (bindRowId !== commandId || !bindTarget) return
    setIsBinding(true)
    setBindMsg(null)
    try {
      const res = await fetch(`/api/servers/${bindTarget}/saved-commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command_id: commandId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Bind failed')
      setBindMsg(data.already_bound ? 'Already bound to that server.' : 'Bound to server.')
      setBindTarget('')
      setBindRowId(null)
    } catch (err) {
      setBindMsg(toFriendlyJobError(err instanceof Error ? err.message : 'Bind failed'))
    } finally {
      setIsBinding(false)
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title="Library"
        description="Shared command templates for chains and server bindings. One source of truth."
        actions={
          <Button type="button" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="size-4" aria-hidden="true" />
            New command
          </Button>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or command…"
          className="pl-9"
          aria-label="Search library"
        />
      </div>

      {formError || bindMsg ? (
        <p className={`text-sm ${formError ? 'text-destructive' : 'text-success'}`}>
          {formError ?? bindMsg}
        </p>
      ) : null}

      {showCreate ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lib-name">Name</Label>
              <Input id="lib-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Update packages" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lib-bind">Bind to server (optional)</Label>
              <select
                id="lib-bind"
                value={bindServerId}
                onChange={(e) => setBindServerId(e.target.value)}
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">None</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.hostname}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lib-cmd">Command</Label>
            <Textarea
              id="lib-cmd"
              value={newCmd}
              onChange={(e) => setNewCmd(e.target.value)}
              placeholder="apt update && apt upgrade -y"
              className="font-mono"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lib-desc">Description</Label>
            <Input id="lib-desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Optional" />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={newInteractive}
              onChange={(e) => setNewInteractive(e.target.checked)}
              className="accent-primary"
            />
            Interactive (awaits prompts)
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isCreating || !newName.trim() || !newCmd.trim()}
              onClick={createCommand}
            >
              {isCreating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : 'Create'}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <p className="text-sm font-medium text-foreground">No library commands</p>
            <p className="mt-1 max-w-sm text-xs">
              Create templates here, then use them in Chains or bind them to servers for one-click runs.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((cmd) => (
              <li key={cmd.id} className="px-4 py-3">
                {editingId === cmd.id ? (
                  <div className="space-y-2">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <Textarea
                      value={editCmd}
                      onChange={(e) => setEditCmd(e.target.value)}
                      className="font-mono"
                      rows={2}
                    />
                    <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" />
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editInteractive}
                        onChange={(e) => setEditInteractive(e.target.checked)}
                        className="accent-primary"
                      />
                      Interactive
                    </label>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" disabled={isSavingEdit} onClick={() => saveEdit(cmd.id)}>
                        {isSavingEdit ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        Save
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="size-3.5" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{cmd.name}</span>
                        {cmd.interactive ? <Badge variant="info">Interactive</Badge> : null}
                      </div>
                      <code className="mt-1 block truncate font-mono text-xs text-muted-foreground" title={cmd.command}>
                        {cmd.command}
                      </code>
                      {cmd.description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{cmd.description}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={bindRowId === cmd.id ? bindTarget : ''}
                        onChange={(e) => {
                          setBindRowId(cmd.id)
                          setBindTarget(e.target.value)
                        }}
                        className="h-7 max-w-[140px] rounded-md border border-input bg-transparent px-2 text-xs outline-none"
                        aria-label={`Bind ${cmd.name} to server`}
                      >
                        <option value="">Bind…</option>
                        {servers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.hostname}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={bindRowId !== cmd.id || !bindTarget || isBinding}
                        onClick={() => bindToServer(cmd.id)}
                      >
                        {isBinding && bindRowId === cmd.id ? (
                          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                        ) : null}
                        Bind
                      </Button>
                      <Button type="button" size="icon-xs" variant="ghost" onClick={() => startEdit(cmd)} aria-label="Edit">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteCommand(cmd.id)}
                        aria-label="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
