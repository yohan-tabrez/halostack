'use client'

import { useActionState } from 'react'
import { login } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Logo } from '@/components/Logo'

const initialState = { error: '' }

export default function LoginForm({ setupComplete = false }: { setupComplete?: boolean }) {
  const [state, formAction, isPending] = useActionState(
    async (prevState: { error: string }, formData: FormData) => {
      const result = await login(formData)
      if (result?.error) return { error: result.error }
      return prevState
    },
    initialState
  )

  return (
    <div className="relative flex min-h-svh bg-background">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="hidden flex-col justify-between border-r border-border bg-gradient-to-br from-primary/15 via-background to-info/10 p-12 lg:flex lg:w-1/2 dark:from-primary/20 dark:via-background dark:to-info/5">
        <Logo href={false} />
        <div>
          <blockquote className="space-y-2">
            <p className="text-lg leading-relaxed text-foreground">
              &ldquo;Secure, centralised command execution across your entire Ubuntu fleet —
              with full audit trails and encrypted credentials at rest.&rdquo;
            </p>
            <footer className="text-sm text-muted-foreground">HALOStack Design Principles</footer>
          </blockquote>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex justify-center lg:hidden">
            <Logo href={false} />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Sign in</h1>
            <p className="text-sm text-muted-foreground">Enter your credentials to access the control plane.</p>
          </div>

          {setupComplete ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2.5 text-sm text-primary">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              Admin account created. You can now sign in.
            </div>
          ) : null}

          <form action={formAction} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="admin@yourcompany.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required />
            </div>

            {state.error ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                {state.error}
              </div>
            ) : null}

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
