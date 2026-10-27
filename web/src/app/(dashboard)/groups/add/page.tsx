'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function AddGroupPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const name = formData.get('name')

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create group')
      }

      router.push('/groups')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/groups" className={buttonVariants({ variant: "ghost", size: "icon", className: "text-muted-foreground hover:text-white" })}>
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Add Group</h2>
          <p className="text-muted-foreground">Create a new server group for fleet operations.</p>
        </div>
      </div>

      <Card className="border-border bg-card text-foreground">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Group Details
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Groups allow executing commands on multiple servers concurrently.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground">Group Name</Label>
              <Input id="name" name="name" required placeholder="Production Web Nodes" className="border-border bg-background" />
            </div>

            {error && (
              <div className="rounded-md bg-red-900/50 border border-red-800 p-3 text-sm text-red-200 font-medium">
                {error}
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isSubmitting} className="bg-primary text-white hover:bg-primary/90">
                {isSubmitting ? 'Creating...' : 'Create Group'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
