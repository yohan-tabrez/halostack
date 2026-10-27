'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

export type JobUpdate = {
  type: 'job_update'
  job_id: string
  server_id?: string
  issued_by?: string | null
  group_id?: string | null
  status: string
  stdout?: string | null
  stderr?: string | null
  exit_code?: number | null
  /** Display enrichment from History page hydrate (preserved across WS merges). */
  command?: string | null
  hostname?: string | null
  issuer_email?: string | null
  queued_at?: string | null
}

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'failed'

const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled'])

export function isTerminalStatus(status: string | undefined) {
  return status !== undefined && TERMINAL_STATUSES.has(status)
}

/**
 * One socket per tab, shared by every hook consumer and ref-counted.
 *
 * Previously each caller opened its own socket with `filterJobId` in the effect
 * deps, so the socket tore down and reconnected the moment a job id arrived —
 * and jobs finish in ~2s, so terminal updates routinely landed in that gap and
 * were lost forever. Updates are now buffered in a module-level store that
 * outlives any component, so an update that arrives before a component renders
 * is still there when it does.
 */
const jobStore = new Map<string, JobUpdate>()
const listeners = new Set<() => void>()

const EMPTY_JOBS: JobUpdate[] = []
let storeVersion = 0
let cachedSnapshot: JobUpdate[] = EMPTY_JOBS
let cachedVersion = -1

// useSyncExternalStore demands a referentially stable snapshot — rebuilding the
// array on every call would re-render forever.
function jobStoreSnapshot(): JobUpdate[] {
  if (cachedVersion === storeVersion) return cachedSnapshot
  cachedVersion = storeVersion
  cachedSnapshot = Array.from(jobStore.values()).slice(-100).reverse()
  return cachedSnapshot
}

let socket: WebSocket | null = null
let refCount = 0
let connectionState: ConnectionState = 'idle'
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let generation = 0

function emit() {
  for (const l of listeners) l()
}

function setConnectionState(next: ConnectionState) {
  if (connectionState === next) return
  connectionState = next
  emit()
}

export function applyJobUpdate(update: JobUpdate) {
  const prev = jobStore.get(update.job_id)
  const next = prev ? { ...prev, ...update } : update
  // Merge: streaming frames may omit fields a previous frame carried.
  jobStore.set(update.job_id, next)
  storeVersion++
  emit()
}

function backoffDelay(attempt: number) {
  const base = Math.min(500 * 2 ** attempt, 15_000)
  return base * (0.8 + Math.random() * 0.4) // ±20% jitter
}

async function connect() {
  const myGeneration = generation
  setConnectionState(reconnectAttempt === 0 ? 'connecting' : 'reconnecting')

  let token: string
  let wsUrl: string
  try {
    const res = await fetch('/api/ws/token')
    if (!res.ok) throw new Error(`token ${res.status}`)
    ;({ token, wsUrl } = await res.json())
  } catch {
    if (myGeneration !== generation) return
    scheduleReconnect()
    return
  }

  // The socket may have been torn down while we awaited the token.
  if (myGeneration !== generation) return

  const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`)
  socket = ws

  ws.onopen = () => {
    if (myGeneration !== generation) {
      ws.close()
      return
    }
    reconnectAttempt = 0
    setConnectionState('open')
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as JobUpdate
      if (data.type === 'job_update') applyJobUpdate(data)
    } catch {
      /* ignore malformed frame */
    }
  }

  ws.onclose = (event) => {
    if (myGeneration !== generation) return
    socket = null
    // 1008 is our own "Invalid session" close. Auth failure is not transient —
    // retrying just hammers the agent, so surface it and let polling take over.
    if (event.code === 1008) {
      setConnectionState('failed')
      return
    }
    scheduleReconnect()
  }
}

function scheduleReconnect() {
  if (refCount === 0) return
  setConnectionState('reconnecting')
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (refCount > 0) connect()
  }, backoffDelay(reconnectAttempt++))
}

function acquire() {
  refCount++
  if (refCount === 1) connect()
}

function release() {
  refCount--
  if (refCount > 0) return
  generation++ // invalidate any in-flight connect()
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  socket?.close()
  socket = null
  reconnectAttempt = 0
  setConnectionState('idle')
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function useJobSocket() {
  useEffect(() => {
    acquire()
    return release
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => connectionState,
    () => 'idle' as const
  )
}

/**
 * Polls the REST fallback while the socket isn't delivering, so a job can never
 * appear to hang after it has actually finished.
 */
function usePollFallback(jobId: string | null, state: ConnectionState) {
  useEffect(() => {
    if (!jobId) return
    if (state === 'open') return

    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`)
        if (!res.ok || cancelled) return
        const data = (await res.json()) as JobUpdate
        applyJobUpdate(data)
      } catch {
        /* keep polling */
      }
    }

    void tick()
    const interval = setInterval(() => {
      if (isTerminalStatus(jobStore.get(jobId)?.status)) return
      void tick()
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [jobId, state])
}

export function useJobWebSocket(filterJobId: string | null) {
  const connectionState = useJobSocket()
  usePollFallback(filterJobId, connectionState)

  // filterJobId is applied at read time, never as an effect dependency — that
  // is what stops the socket churning on every new job.
  const lastUpdate = useSyncExternalStore(
    subscribe,
    useCallback(() => (filterJobId ? jobStore.get(filterJobId) ?? null : null), [filterJobId]),
    () => null
  )

  return { lastUpdate, connectionState }
}

export function useJobsFeed() {
  useJobSocket()
  return useSyncExternalStore(subscribe, jobStoreSnapshot, () => EMPTY_JOBS)
}
