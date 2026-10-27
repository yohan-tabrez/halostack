'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Trash2, Loader2 } from 'lucide-react'

export default function DeleteServerButton({ serverId }: { serverId: string }) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  async function handleDelete() {
    if (!confirm('Permanently delete this server and all its credentials? This cannot be undone.')) return
    setIsPending(true)
    try {
      const res = await fetch(`/api/servers/${serverId}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/servers')
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete server.')
        setIsPending(false)
      }
    } catch {
      alert('Network error — could not delete server.')
      setIsPending(false)
    }
  }

  return (
    <Button
      variant="destructive"
      size="icon"
      className="bg-red-900/50 text-red-200 hover:bg-red-800 border border-red-800"
      onClick={handleDelete}
      disabled={isPending}
      title="Delete server"
    >
      {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </Button>
  )
}
