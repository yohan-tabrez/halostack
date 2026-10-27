'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'

interface User {
  id: string
  email: string
  role: string
  createdAt: string
  groupIds?: string[]
}

interface GroupOption {
  id: string
  name: string
}

const ROLE_LABELS: Record<string, string> = {
  global_admin: 'Global Admin',
  group_admin: 'Group Admin',
  power_user: 'Power User',
  read_only: 'Read Only',
}
const ROLES = Object.keys(ROLE_LABELS)

const inputClassName =
  'bg-background border-input text-white placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50'

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirm) {
      setStatus('error')
      setMessage('Passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setStatus('error')
      setMessage('Password must be at least 8 characters.')
      return
    }
    setStatus('loading')
    const res = await fetch('/api/settings/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    if (!res.ok) {
      const data = await res.json()
      setStatus('error')
      setMessage(data.error || 'Failed to update password')
    } else {
      setStatus('success')
      setMessage('Password updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-sm">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Current Password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className={`w-full border rounded-md px-3 py-2 text-sm outline-none ${inputClassName}`}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">New Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          className={`w-full border rounded-md px-3 py-2 text-sm outline-none ${inputClassName}`}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Confirm Password</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          className={`w-full border rounded-md px-3 py-2 text-sm outline-none ${inputClassName}`}
        />
      </div>
      {message && (
        <p className={`text-xs ${status === 'success' ? 'text-primary' : 'text-destructive'}`}>{message}</p>
      )}
      <Button type="submit" disabled={status === 'loading'} className="bg-primary hover:bg-primary/90 text-white" size="sm">
        {status === 'loading' ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
        Update Password
      </Button>
    </form>
  )
}

function UserFormDialog({
  open,
  mode,
  user,
  currentUserId,
  groups,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  mode: 'create' | 'edit'
  user: User | null
  currentUserId: string
  groups: GroupOption[]
  onOpenChange: (open: boolean) => void
  onSaved: (user: User) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('read_only')
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const isSelf = mode === 'edit' && user?.id === currentUserId

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && user) {
      setEmail(user.email)
      setRole(user.role)
      setGroupIds(user.groupIds ?? [])
    } else {
      setEmail('')
      setRole('read_only')
      setGroupIds([])
    }
    setPassword('')
    setError('')
    setStatus('idle')
  }, [open, mode, user])

  function toggleGroup(id: string) {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')

    try {
      let saved: User
      if (mode === 'create') {
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters.')
        }
        const res = await fetch('/api/settings/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, role }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to create user')
        saved = {
          ...data.user,
          createdAt: new Date(data.user.createdAt).toISOString(),
          groupIds: [],
        }
      } else if (user) {
        const payload: { email?: string; role?: string; password?: string } = { email }
        if (!isSelf) payload.role = role
        if (password) payload.password = password

        const res = await fetch(`/api/settings/users/${user.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to update user')
        saved = {
          ...data.user,
          createdAt: new Date(data.user.createdAt).toISOString(),
          groupIds: user.groupIds,
        }
      } else {
        throw new Error('No user')
      }

      const memRes = await fetch(`/api/settings/users/${saved.id}/memberships`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds }),
      })
      if (!memRes.ok) {
        const data = await memRes.json()
        throw new Error(data.error || 'Failed to update group memberships')
      }
      saved.groupIds = groupIds
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      setStatus('error')
      setError((err as Error).message)
    } finally {
      setStatus('idle')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{mode === 'create' ? 'Add User' : 'Edit User'}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {mode === 'create'
              ? 'Create a new HALOStack account with email, password, and role.'
              : 'Update account details. Leave password blank to keep the current password.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="user-email" className="text-foreground">
              Email
            </Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputClassName}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-role" className="text-foreground">
              Role
            </Label>
            {isSelf ? (
              <p className="text-sm text-muted-foreground">{ROLE_LABELS[role] ?? role}</p>
            ) : (
              <select
                id="user-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-white outline-none focus:border-ring"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-password" className="text-foreground">
              {mode === 'create' ? 'Password' : 'New Password'}
            </Label>
            <Input
              id="user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={mode === 'create'}
              minLength={mode === 'create' ? 8 : undefined}
              placeholder={mode === 'edit' ? 'Leave blank to keep current password' : undefined}
              className={inputClassName}
            />
          </div>
          {groups.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-foreground">Group memberships</Label>
              <p className="text-xs text-muted-foreground">Required for group_admin scoping.</p>
              <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-lg border border-border p-2">
                {groups.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={groupIds.includes(g.id)}
                      onChange={() => toggleGroup(g.id)}
                      className="rounded border-input"
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="border-t border-border bg-muted/50">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-input text-foreground">
              Cancel
            </Button>
            <Button type="submit" disabled={status === 'loading'} className="bg-primary hover:bg-primary/90 text-white">
              {status === 'loading' ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              {mode === 'create' ? 'Create User' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UserManagementTable({
  initialUsers,
  currentUserId,
  groups,
}: {
  initialUsers: User[]
  currentUserId: string
  groups: GroupOption[]
}) {
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [updating, setUpdating] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingUser, setEditingUser] = useState<User | null>(null)

  function openCreateDialog() {
    setDialogMode('create')
    setEditingUser(null)
    setDialogOpen(true)
  }

  function openEditDialog(user: User) {
    setDialogMode('edit')
    setEditingUser(user)
    setDialogOpen(true)
  }

  function handleSaved(user: User) {
    if (dialogMode === 'create') {
      setUsers((prev) => [user, ...prev])
    } else {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? user : u)))
    }
    setError('')
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return
    setUpdating((p) => ({ ...p, [id]: true }))
    setError('')
    try {
      const res = await fetch(`/api/settings/users/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error: msg } = await res.json()
        throw new Error(msg)
      }
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUpdating((p) => ({ ...p, [id]: false }))
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{users.length} user{users.length === 1 ? '' : 's'}</p>
        <Button onClick={openCreateDialog} size="sm" className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="size-3.5 mr-1.5" />
          Add User
        </Button>
      </div>

      {error && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">{error}</p>}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background/50">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Email</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Role</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Joined</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 text-white font-mono text-xs">
                  {u.email}
                  {u.id === currentUserId && <span className="ml-2 text-primary text-[10px]">(you)</span>}
                </td>
                <td className="px-4 py-3 text-foreground text-xs">
                  {ROLE_LABELS[u.role] ?? u.role}
                  {(u.groupIds?.length ?? 0) > 0 && (
                    <span className="block text-[10px] text-muted-foreground mt-0.5">
                      {u.groupIds!
                        .map((id) => groups.find((g) => g.id === id)?.name ?? id.slice(0, 8))
                        .join(', ')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEditDialog(u)}
                      disabled={updating[u.id]}
                      title="Edit user"
                      className="p-1.5 text-muted-foreground hover:text-primary"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    {u.id !== currentUserId && (
                      <button
                        onClick={() => deleteUser(u.id, u.email)}
                        disabled={updating[u.id]}
                        title="Delete user"
                        className="p-1.5 text-muted-foreground hover:text-destructive"
                      >
                        {updating[u.id] ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UserFormDialog
        open={dialogOpen}
        mode={dialogMode}
        user={editingUser}
        currentUserId={currentUserId}
        groups={groups}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
      />
    </div>
  )
}
