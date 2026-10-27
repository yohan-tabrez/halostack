'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Loader2, AlertCircle, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/Logo'

export default function SetupForm() {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    const confirm = (form.elements.namedItem('confirm') as HTMLInputElement).value

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setIsPending(true)
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Setup failed.')
      } else {
        router.push('/login?setup=complete')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="relative flex min-h-svh bg-background">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="hidden flex-col justify-between border-r border-border bg-gradient-to-br from-primary/15 via-background to-info/10 p-12 lg:flex lg:w-1/2 dark:from-primary/20 dark:via-background dark:to-info/5">
        <Logo href={false} />
        <div className="space-y-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Welcome to HALOStack</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              This is a one-time setup. Create the global admin account that will be used to manage
              all infrastructure, users, and access controls.
            </p>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="inline-block size-1.5 rounded-full bg-primary/50" />
              Full access to all servers and groups
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block size-1.5 rounded-full bg-primary/50" />
              Audit log access and user management
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block size-1.5 rounded-full bg-primary/50" />
              Encrypted credential storage at rest
            </li>
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">This screen will not appear again once setup is complete.</p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex justify-center lg:hidden">
            <Logo href={false} />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-primary/20">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-info" />
              First-time setup
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Create admin account</h1>
            <p className="text-sm text-muted-foreground">
              This account will have full control of the HALOStack deployment.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" name="email" type="email" placeholder="admin@yourcompany.com" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Minimum 8 characters"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" name="confirm" type="password" placeholder="Repeat password" required />
            </div>

            {error ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                {error}
              </div>
            ) : null}

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  Creating account…
                </>
              ) : (
                'Create admin account'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
