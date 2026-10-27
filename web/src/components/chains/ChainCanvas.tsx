'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Plus, Save, Play, Trash2, Loader2 } from 'lucide-react'
import { hasCycle } from '@/lib/chain-graph'

type Cmd = { id: string; name: string; interactive: boolean }
type Srv = { id: string; hostname: string }
type Grp = { id: string; name: string }

type StepData = {
  label: string
  commandId: string | null
  targetMode: 'servers' | 'group'
  targetServerIds: string[]
  targetGroupId: string | null
  continueOnFailure: boolean
  commands: Cmd[]
}

const CONDITIONS = ['on_success', 'on_failure', 'always'] as const
const EDGE_COLOR: Record<string, string> = {
  on_success: '#10b981',
  on_failure: '#ef4444',
  always: '#64748b',
}

// A step node just renders its command name + a target-count badge; details are
// edited in the side panel to keep the node compact.
function StepNode({ data, selected }: NodeProps<Node<StepData>>) {
  const cmd = data.commands.find((c) => c.id === data.commandId)
  const targets =
    data.targetMode === 'group'
      ? data.targetGroupId
        ? '1 group'
        : 'no target'
      : `${data.targetServerIds.length} server${data.targetServerIds.length === 1 ? '' : 's'}`
  return (
    <div
      className={`rounded-lg border bg-card px-3 py-2 text-sm shadow-md min-w-[160px] ${
        selected ? 'border-primary' : 'border-input'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div className="font-medium text-foreground truncate">{cmd?.name ?? '(pick a command)'}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        {targets}
        {data.continueOnFailure ? ' · continue on fail' : ''}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  )
}

const nodeTypes = { step: StepNode }

export default function ChainCanvas({
  chain,
  initialSteps,
  initialEdges,
  commands,
  servers,
  groups,
}: {
  chain: { id: string; name: string; description: string | null }
  initialSteps: Array<Record<string, unknown>>
  initialEdges: Array<Record<string, unknown>>
  commands: Cmd[]
  servers: Srv[]
  groups: Grp[]
}) {
  const router = useRouter()

  const initialNodes: Node<StepData>[] = useMemo(
    () =>
      initialSteps.map((s, i) => {
        const graph = (chain as unknown as { graph?: Record<string, { x: number; y: number }> }).graph
        const pos = graph?.[s.nodeKey as string]
        return {
          id: s.nodeKey as string,
          type: 'step',
          position: pos ?? { x: 120 + (i % 3) * 220, y: 80 + Math.floor(i / 3) * 140 },
          data: {
            label: s.nodeKey as string,
            commandId: (s.commandId as string) ?? null,
            targetMode: ((s.targetMode as string) ?? 'servers') as 'servers' | 'group',
            targetServerIds: (s.targetServerIds as string[]) ?? [],
            targetGroupId: (s.targetGroupId as string | null) ?? null,
            continueOnFailure: Boolean(s.continueOnFailure),
            commands,
          },
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const initialFlowEdges: Edge[] = useMemo(
    () =>
      initialEdges.map((e) => ({
        id: `${e.fromNodeKey}-${e.toNodeKey}`,
        source: e.fromNodeKey as string,
        target: e.toNodeKey as string,
        label: e.condition as string,
        data: { condition: e.condition },
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: EDGE_COLOR[(e.condition as string) ?? 'on_success'] },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StepData>>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialFlowEdges)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'run' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = nodes.find((n) => n.id === selectedId) ?? null

  const onConnect = useCallback(
    (c: Connection) => {
      const edge: Edge = {
        id: `${c.source}-${c.target}`,
        source: c.source,
        target: c.target,
        label: 'on_success',
        data: { condition: 'on_success' },
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: EDGE_COLOR.on_success },
      }
      setEdges((eds: Edge[]) => addEdge(edge, eds))
    },
    [setEdges]
  )

  // Clicking an edge cycles its condition (success → failure → always).
  const onEdgeClick = useCallback(
    (_: unknown, edge: Edge) => {
      setEdges((eds: Edge[]) =>
        eds.map((e) => {
          if (e.id !== edge.id) return e
          const cur = (e.data?.condition as string) ?? 'on_success'
          const next = CONDITIONS[(CONDITIONS.indexOf(cur as (typeof CONDITIONS)[number]) + 1) % CONDITIONS.length]
          return { ...e, label: next, data: { condition: next }, style: { stroke: EDGE_COLOR[next] } }
        })
      )
    },
    [setEdges]
  )

  const addStep = () => {
    const id = `n${Date.now().toString(36)}`
    setNodes((ns: Node<StepData>[]) => [
      ...ns,
      {
        id,
        type: 'step',
        position: { x: 160, y: 120 + ns.length * 30 },
        data: {
          label: id,
          commandId: null,
          targetMode: 'servers',
          targetServerIds: [],
          targetGroupId: null,
          continueOnFailure: false,
          commands,
        },
      },
    ])
    setSelectedId(id)
  }

  const patchSelected = (patch: Partial<StepData>) => {
    setNodes((ns: Node<StepData>[]) =>
      ns.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n))
    )
  }

  const deleteSelected = () => {
    if (!selectedId) return
    setNodes((ns: Node<StepData>[]) => ns.filter((n) => n.id !== selectedId))
    setEdges((es: Edge[]) => es.filter((e) => e.source !== selectedId && e.target !== selectedId))
    setSelectedId(null)
  }

  const buildPayload = () => {
    const steps = nodes.map((n) => ({
      nodeKey: n.id,
      commandId: n.data.commandId,
      targetMode: n.data.targetMode,
      targetServerIds: n.data.targetServerIds,
      targetGroupId: n.data.targetGroupId,
      continueOnFailure: n.data.continueOnFailure,
    }))
    const graphEdges = edges.map((e) => ({
      from: e.source,
      to: e.target,
      condition: (e.data?.condition as string) ?? 'on_success',
    }))
    const graph = Object.fromEntries(nodes.map((n) => [n.id, n.position]))
    return { name: chain.name, description: chain.description, graph, steps, edges: graphEdges }
  }

  const validate = (payload: ReturnType<typeof buildPayload>): string | null => {
    if (!payload.steps.length) return 'Add at least one step.'
    if (payload.steps.some((s) => !s.commandId)) return 'Every step needs a command.'
    if (
      payload.steps.some(
        (s) =>
          (s.targetMode === 'servers' && !s.targetServerIds.length) ||
          (s.targetMode === 'group' && !s.targetGroupId)
      )
    )
      return 'Every step needs at least one target server or a group.'
    if (hasCycle(payload.steps.map((s) => ({ nodeKey: s.nodeKey })), payload.edges))
      return 'The graph has a cycle — steps must form a DAG.'
    return null
  }

  const save = async () => {
    const payload = buildPayload()
    const err = validate(payload)
    if (err) return setError(err)
    setError(null)
    setBusy('save')
    const res = await fetch(`/api/chains/${chain.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setBusy(null)
    if (!res.ok) setError((await res.json().catch(() => ({})))?.error ?? 'Save failed')
    else router.refresh()
  }

  const run = async () => {
    const payload = buildPayload()
    const err = validate(payload)
    if (err) return setError(err)
    setError(null)
    setBusy('run')
    // Save first so the run uses the current graph.
    const saveRes = await fetch(`/api/chains/${chain.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!saveRes.ok) {
      setBusy(null)
      return setError('Save failed before run')
    }
    const res = await fetch(`/api/chains/${chain.id}/run`, { method: 'POST' })
    setBusy(null)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return setError(body?.error ?? 'Run failed')
    router.push(`/chains/runs/${body.run_id}`)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] -m-2">
      <div className="flex items-center justify-between mb-3 px-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">{chain.name}</h2>
          {chain.description && <p className="text-sm text-muted-foreground">{chain.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addStep}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            <Plus className="size-4" /> Step
          </button>
          <button
            onClick={save}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
          >
            {busy === 'save' ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
          </button>
          <button
            onClick={run}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {busy === 'run' ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Run
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-2 mb-2 rounded-md border border-red-800 bg-red-900/50 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="flex flex-1 gap-2 min-h-0">
        <div className="flex-1 rounded-lg border border-border overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            onNodeClick={(_: unknown, n: Node) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            colorMode="dark"
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {selected && (
          <StepEditor
            key={selected.id}
            data={selected.data}
            servers={servers}
            groups={groups}
            onChange={patchSelected}
            onDelete={deleteSelected}
          />
        )}
      </div>

      <p className="px-2 pt-2 text-[11px] text-muted-foreground">
        Drag from a node&apos;s bottom handle to another&apos;s top to link steps. Click an edge to
        cycle its condition (green = on success, red = on failure, grey = always).
      </p>
    </div>
  )
}

function StepEditor({
  data,
  servers,
  groups,
  onChange,
  onDelete,
}: {
  data: StepData
  servers: Srv[]
  groups: Grp[]
  onChange: (patch: Partial<StepData>) => void
  onDelete: () => void
}) {
  const toggleServer = (id: string) => {
    const has = data.targetServerIds.includes(id)
    onChange({
      targetServerIds: has
        ? data.targetServerIds.filter((s) => s !== id)
        : [...data.targetServerIds, id],
    })
  }

  return (
    <div className="w-72 shrink-0 rounded-lg border border-border bg-card p-3 space-y-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step</span>
        <button onClick={onDelete} className="p-1 text-muted-foreground hover:text-destructive" title="Delete step">
          <Trash2 className="size-4" />
        </button>
      </div>

      <label className="block text-xs text-muted-foreground">
        Library command
        <select
          value={data.commandId ?? ''}
          onChange={(e) => onChange({ commandId: e.target.value || null })}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
        >
          <option value="">— pick a library command —</option>
          {data.commands.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.interactive ? ' (interactive)' : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-muted-foreground">
        Target
        <select
          value={data.targetMode}
          onChange={(e) => onChange({ targetMode: e.target.value as 'servers' | 'group' })}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
        >
          <option value="servers">Specific servers</option>
          <option value="group">A group (fan-out)</option>
        </select>
      </label>

      {data.targetMode === 'group' ? (
        <select
          value={data.targetGroupId ?? ''}
          onChange={(e) => onChange({ targetGroupId: e.target.value || null })}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
        >
          <option value="">— pick a group —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      ) : (
        <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {servers.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No servers.</p>}
          {servers.map((s) => (
            <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={data.targetServerIds.includes(s.id)}
                onChange={() => toggleServer(s.id)}
              />
              {s.hostname}
            </label>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={data.continueOnFailure}
          onChange={(e) => onChange({ continueOnFailure: e.target.checked })}
        />
        Continue chain if this step fails
      </label>
    </div>
  )
}
