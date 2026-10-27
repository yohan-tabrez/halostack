'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { Loader2, Terminal as TerminalIcon } from 'lucide-react'

function terminalTheme(isDark: boolean) {
  return isDark
    ? {
        background: '#0b1220',
        foreground: '#e2e8f0',
        cursor: '#3b82f6',
        selectionBackground: '#1e3a5f',
      }
    : {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#2563eb',
        selectionBackground: '#1e40af',
      }
}

export default function WebTerminal({ serverId }: { serverId: string }) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const { resolvedTheme } = useTheme()
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = terminalTheme(resolvedTheme !== 'light')
  }, [resolvedTheme])

  useEffect(() => {
    let ws: WebSocket
    let term: Terminal
    let fitAddon: FitAddon
    let observer: ResizeObserver | undefined

    async function init() {
      try {
        const res = await fetch('/api/pty/ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ server_id: serverId }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to request ticket')
        }

        const { ticket } = await res.json()
        const isDark = document.documentElement.classList.contains('dark')

        term = new Terminal({
          cursorBlink: true,
          theme: terminalTheme(isDark),
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontSize: 14,
        })
        termRef.current = term

        fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.open(terminalRef.current!)
        fitAddon.fit()

        term.writeln('\x1b[36m[*] Initializing secure PTY tunnel...\x1b[0m')

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsHost = window.location.hostname
        ws = new WebSocket(`${wsProtocol}//${wsHost}:8080?ticket=${ticket}`)
        ws.binaryType = 'arraybuffer'

        ws.onopen = () => {
          setStatus('connected')
          term.writeln('\x1b[32m[+] Tunnel established. Authenticating SSH...\x1b[0m')
        }

        ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            try {
              const msg = JSON.parse(event.data)
              if (msg.type === 'ready') {
                term.onData((data) => {
                  ws.send(data)
                })

                const sendSize = () => {
                  fitAddon.fit()
                  ws.send(
                    JSON.stringify({
                      type: 'resize',
                      cols: term.cols,
                      rows: term.rows,
                    })
                  )
                }
                sendSize()
                window.addEventListener('resize', sendSize)
              } else if (msg.type === 'error') {
                setStatus('error')
                setErrorMsg(msg.message || 'PTY error')
              }
            } catch {
              term.write(event.data)
            }
          } else {
            term.write(new Uint8Array(event.data as ArrayBuffer))
          }
        }

        ws.onclose = () => {
          setStatus('disconnected')
          term.writeln('\r\n\x1b[33m[*] Session closed.\x1b[0m')
        }

        ws.onerror = () => {
          setStatus('error')
          setErrorMsg('WebSocket connection failed.')
        }

        observer = new ResizeObserver(() => fitAddon.fit())
        observer.observe(terminalRef.current!)
      } catch (e) {
        setStatus('error')
        setErrorMsg(e instanceof Error ? e.message : 'Terminal failed to start')
      }
    }

    init()

    return () => {
      observer?.disconnect()
      ws?.close()
      term?.dispose()
      termRef.current = null
    }
  }, [serverId])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-background">
      <div className="flex h-10 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <TerminalIcon className="size-4 text-primary" aria-hidden="true" />
          Interactive Shell
        </div>
        <div className="flex items-center gap-2">
          {status === 'connecting' && (
            <span className="flex items-center gap-1.5 text-xs text-warning">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Connecting
            </span>
          )}
          {status === 'connected' && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <span className="size-2 animate-pulse rounded-full bg-primary" /> Live PTY
            </span>
          )}
          {status === 'disconnected' && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">Disconnected</span>
          )}
          {status === 'error' && (
            <span className="flex items-center gap-1.5 text-xs text-destructive">Error</span>
          )}
        </div>
      </div>

      {status === 'error' ? (
        <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to connect to PTY: {errorMsg}
        </div>
      ) : null}

      <div
        ref={terminalRef}
        className={`h-full w-full flex-1 overflow-hidden p-2 ${status === 'error' ? 'hidden' : 'block'}`}
      />
    </div>
  )
}
