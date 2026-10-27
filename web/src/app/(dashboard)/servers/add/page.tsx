'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Server, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

type GroupOption = { id: string; name: string }

export default function AddServerPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [authType, setAuthType] = useState<'key' | 'password'>('key')
  const [groups, setGroups] = useState<GroupOption[]>([])

  useEffect(() => {
    fetch('/api/groups')
      .then((res) => res.json())
      .then((data) => setGroups((data.groups as GroupOption[]) || []))
      .catch(console.error)
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const payload = {
      hostname: formData.get('hostname'),
      ip_address: formData.get('ip_address'),
      port: parseInt(formData.get('port') as string) || 22,
      groupId: formData.get('groupId') || null,
      username: formData.get('username'),
      sshAuthType: authType,
      sshPrivateKey: authType === 'key' ? formData.get('sshPrivateKey') : null,
      sshPassphrase: authType === 'key' ? formData.get('sshPassphrase') : null,
      sshPassword: authType === 'password' ? formData.get('sshPassword') : null,
      sudoPassword: formData.get('sudoPassword') || null
    }

    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add server')
      }

      router.push('/servers')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add server')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/servers" className={buttonVariants({ variant: "ghost", size: "icon", className: "text-muted-foreground hover:text-white" })}>
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Add Server</h2>
          <p className="text-muted-foreground">Connect a new Ubuntu server to the control plane.</p>
        </div>
      </div>

      <Card className="border-border bg-card text-foreground">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="size-5" />
            Connection Details
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Credentials are encrypted with AES-256-GCM before resting in the database.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hostname" className="text-foreground">Hostname (Alias)</Label>
                <Input id="hostname" name="hostname" required placeholder="web-node-01" className="border-border bg-background" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ip_address" className="text-foreground">IP Address</Label>
                <Input id="ip_address" name="ip_address" required placeholder="192.168.1.10" className="border-border bg-background" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="port" className="text-foreground">SSH Port</Label>
                <Input id="port" name="port" type="number" defaultValue="22" required className="border-border bg-background" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="groupId" className="text-foreground">Server Group (Optional)</Label>
                <select 
                  id="groupId" 
                  name="groupId" 
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">None</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="text-foreground">SSH Username</Label>
              <Input id="username" name="username" required placeholder="ubuntu" className="border-border bg-background" />
            </div>

            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant={authType === 'key' ? 'default' : 'outline'}
                  onClick={() => setAuthType('key')}
                >
                  SSH Key
                </Button>
                <Button 
                  type="button" 
                  variant={authType === 'password' ? 'default' : 'outline'}
                  onClick={() => setAuthType('password')}
                >
                  Password
                </Button>
              </div>

              {authType === 'key' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="sshPrivateKey" className="text-foreground">Private Key (RSA/Ed25519) <span className="text-destructive">*</span></Label>
                    <textarea 
                      id="sshPrivateKey" 
                      name="sshPrivateKey" 
                      required 
                      rows={5}
                      placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
                      className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sshPassphrase" className="text-foreground">Key Passphrase (Optional)</Label>
                    <Input id="sshPassphrase" name="sshPassphrase" type="password" placeholder="Leave blank if key is not encrypted" className="border-border bg-background" />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="sshPassword" className="text-foreground">SSH Password <span className="text-destructive">*</span></Label>
                  <Input id="sshPassword" name="sshPassword" type="password" required className="border-border bg-background" />
                </div>
              )}
            </div>

            <div className="space-y-2 pt-4 border-t border-border">
              <Label htmlFor="sudoPassword" className="text-foreground">Sudo Password (Optional)</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Used for automated `sudo -S` command execution. Leave blank if user has NOPASSWD in sudoers.
              </p>
              <Input id="sudoPassword" name="sudoPassword" type="password" className="border-border bg-background" />
            </div>

            {error && (
              <div className="rounded-md bg-red-900/50 border border-red-800 p-3 text-sm text-red-200 font-medium">
                {error}
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isSubmitting} className="bg-primary text-white hover:bg-primary/90">
                {isSubmitting ? 'Saving...' : 'Save & Connect'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
