# HALOStack Design System

> Dense ops console for self-hosted SSH fleet control. Blue/cyan infra palette with light + dark themes.

## Product

- **Type:** Infrastructure / DevOps control plane
- **Stack:** Next.js 16, React 19, Tailwind 4, shadcn (base-nova), Lucide
- **Density:** High (dashboard)
- **Motion:** Subtle only
- **Theme:** System default; user toggle in header (`next-themes`)

## Colors (semantic tokens in `web/src/app/globals.css`)

| Role | Light | Dark |
|------|-------|------|
| Primary | `#2563EB` | `#3B82F6` |
| Info / accent | `#0891B2` | `#22D3EE` |
| Background | `#F8FAFC` | `#0B1220` |
| Card | `#FFFFFF` | `#111827` |
| Foreground | `#0F172A` | `#E2E8F0` |
| Muted foreground | `#475569` | `#94A3B8` |
| Border | `#E2E8F0` | `#1E293B` |
| Destructive | `#DC2626` | `#F87171` |
| Success | `#059669` | `#34D399` |
| Warning | `#D97706` | `#FBBF24` |

**Do:** use `bg-background`, `bg-card`, `bg-primary`, `text-muted-foreground`, `border-border`, `text-success`, etc.  
**Don't:** hardcode `slate-*` / `emerald-*` utilities.

## Typography

- **UI:** Plus Jakarta Sans (`--font-jakarta` → `--font-sans`)
- **Commands / terminal:** Geist Mono (`--font-geist-mono` → `--font-mono`)

## Information architecture

| Nav label | Route | Role |
|-----------|-------|------|
| Dashboard | `/` | Overview |
| Library | `/commands` | Global `commands` CRUD + server binds |
| Chains | `/chains` | Multi-step flows using Library |
| Servers / Groups | `/servers`, `/groups` | Inventory + contextual `CommandRunBar` |
| History | `/jobs` | Rich job feed |
| Audit Log | `/audit` | Admin security events |
| Settings | `/settings` | Account / users / API keys |

## Shell

- Collapsible sidebar on small screens (`DashboardShell`)
- Page-aware header title + theme toggle
- Shared `PageHeader` for page titles/actions

## Anti-patterns

- Neon / HUD / glow sci-fi chrome
- Dual command libraries (per-server CRUD vs global)
- Emerald accent leftovers
- Forced dark-only `className="dark"` on `<html>`
- Job rows that only show UUIDs

## Checklist

- [ ] Theme toggle flips login, setup, and dashboard
- [ ] Body text ≥ 4.5:1 in both themes
- [ ] Focus rings visible
- [ ] Lucide icons only (no emoji icons)
- [ ] Library is source of truth for chains and binds
