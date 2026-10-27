// Shared chain-graph helpers, used by both the editor (client) and the API (server)
// so cycle rejection can't drift between them.

export type GraphStep = { nodeKey: string }
export type GraphEdge = { from: string; to: string }

/** DFS cycle detection over the node/edge lists. */
export function hasCycle(steps: GraphStep[], edges: GraphEdge[]): boolean {
  const adj = new Map<string, string[]>()
  for (const s of steps) adj.set(s.nodeKey, [])
  for (const e of edges) (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to)

  const WHITE = 0, GREY = 1, BLACK = 2
  const color = new Map<string, number>()

  const visit = (n: string): boolean => {
    color.set(n, GREY)
    for (const m of adj.get(n) ?? []) {
      const c = color.get(m) ?? WHITE
      if (c === GREY) return true // back-edge = cycle
      if (c === WHITE && visit(m)) return true
    }
    color.set(n, BLACK)
    return false
  }

  for (const n of adj.keys()) {
    if ((color.get(n) ?? WHITE) === WHITE && visit(n)) return true
  }
  return false
}
