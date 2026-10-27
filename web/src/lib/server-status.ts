// One source of truth for server status presentation. The agent writes 'reachable'
// / 'unreachable' / 'unknown' (never 'online' — that was a bug that rendered
// reachable servers grey on the Commands page).

export type ServerStatus = 'reachable' | 'unreachable' | 'unknown' | string

export function statusMeta(status: ServerStatus): { dot: string; text: string; label: string } {
  switch (status) {
    case 'reachable':
      return { dot: 'bg-primary', text: 'text-primary', label: 'Reachable' }
    case 'unreachable':
      return { dot: 'bg-destructive', text: 'text-destructive', label: 'Unreachable' }
    default:
      return { dot: 'bg-warning', text: 'text-warning', label: 'Unknown' }
  }
}
