'use client'

import { signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Terminal,
  Server,
  Users,
  ShieldAlert,
  Settings,
  LogOut,
  BookOpen,
  Activity,
  Workflow,
  Network,
} from 'lucide-react'
import { navItemsForRole } from '@/lib/rbac'
import type { UserRole } from '@halostack/db'
import { Badge } from '@/components/ui/badge'
import { Logo } from '@/components/Logo'

const iconMap = {
  Dashboard: Terminal,
  Library: BookOpen,
  Chains: Workflow,
  Servers: Server,
  Groups: Users,
  History: Activity,
  'Network Scan': Network,
  'Audit Log': ShieldAlert,
  Settings: Settings,
}

interface SidebarNavProps {
  email: string
  role: UserRole
  onNavigate?: () => void
}

export default function SidebarNav({ email, role, onNavigate }: SidebarNavProps) {
  const pathname = usePathname()
  const navItems = navItemsForRole(role)

  async function handleSignOut() {
    await signOut({ callbackUrl: '/login' })
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const roleVariant =
    role === 'global_admin'
      ? 'default'
      : role === 'group_admin'
        ? 'info'
        : role === 'power_user'
          ? 'warning'
          : 'secondary'

  return (
    <>
      <div className="mb-8 px-2">
        <Logo
          href="/"
          wordmarkClassName="text-base font-semibold tracking-tight text-sidebar-foreground"
        />
      </div>

      <nav className="flex-1 space-y-0.5" aria-label="Main">
        {navItems.map(({ href, label }) => {
          const Icon = iconMap[label as keyof typeof iconMap] ?? Terminal
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-primary/20'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto space-y-0.5 border-t border-sidebar-border pt-4">
        <div className="mt-2 px-3 py-2">
          <p className="truncate text-sm font-medium text-sidebar-foreground">{email}</p>
          <Badge variant={roleVariant} className="mt-1.5">
            {role.replace(/_/g, ' ')}
          </Badge>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </>
  )
}
