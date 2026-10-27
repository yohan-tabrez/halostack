'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import SidebarNav from '@/components/SidebarNav'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import type { UserRole } from '@halostack/db'

const TITLE_MAP: { match: (path: string) => boolean; title: string; crumb?: string }[] = [
  { match: (p) => p === '/', title: 'Dashboard' },
  { match: (p) => p.startsWith('/commands'), title: 'Library', crumb: 'Commands' },
  { match: (p) => p.startsWith('/chains/runs'), title: 'Chain Run', crumb: 'Chains' },
  { match: (p) => p.match(/^\/chains\/[^/]+$/) !== null, title: 'Chain Editor', crumb: 'Chains' },
  { match: (p) => p.startsWith('/chains'), title: 'Chains' },
  { match: (p) => p.includes('/terminal'), title: 'Terminal', crumb: 'Servers' },
  { match: (p) => p.startsWith('/servers/add'), title: 'Add Server', crumb: 'Servers' },
  { match: (p) => p.match(/^\/servers\/[^/]+$/) !== null, title: 'Server', crumb: 'Servers' },
  { match: (p) => p.startsWith('/servers'), title: 'Servers' },
  { match: (p) => p.startsWith('/groups/add'), title: 'Add Group', crumb: 'Groups' },
  { match: (p) => p.match(/^\/groups\/[^/]+$/) !== null, title: 'Group', crumb: 'Groups' },
  { match: (p) => p.startsWith('/groups'), title: 'Groups' },
  { match: (p) => p.startsWith('/jobs'), title: 'History' },
  { match: (p) => p.startsWith('/network-scan'), title: 'Network Scan' },
  { match: (p) => p.match(/^\/audit\/[^/]+$/) !== null, title: 'Job Detail', crumb: 'Audit' },
  { match: (p) => p.startsWith('/audit'), title: 'Audit Log' },
  { match: (p) => p.startsWith('/settings'), title: 'Settings' },
]

function resolveTitle(pathname: string): { title: string; crumb?: string } {
  for (const entry of TITLE_MAP) {
    if (entry.match(pathname)) return { title: entry.title, crumb: entry.crumb }
  }
  return { title: 'HALOStack' }
}

export default function DashboardShell({
  email,
  role,
  children,
}: {
  email: string
  role: UserRole
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { title, crumb } = resolveTitle(pathname)

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 transition-transform duration-200 md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-2 flex justify-end md:hidden">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <SidebarNav email={email} role={role} onNavigate={() => setOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-4" aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              {crumb ? (
                <>
                  <span className="hidden text-muted-foreground sm:inline">{crumb}</span>
                  <span className="hidden text-muted-foreground sm:inline">/</span>
                </>
              ) : null}
              <h1 className="truncate font-medium text-foreground">{title}</h1>
            </div>
          </div>
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
