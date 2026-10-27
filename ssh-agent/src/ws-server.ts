import { WebSocketServer, WebSocket } from 'ws'
import { Client as SSHClient } from 'ssh2'
import Redis from 'ioredis'
import pino from 'pino'
import { eq } from 'drizzle-orm'
import { getDb, servers, credentials, userGroupMemberships, users, interactiveSessions } from './lib/db'
import { bufferFromDb, decryptBlob, aadFor, encServerField, decServerField } from './lib/crypto'
import { verifyHostKey } from './lib/host-key'
import { ptySessionsActive } from './metrics'
import { addJobSubscriber, validateSessionToken } from './lib/job-ws'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  // Keep RESP2 for BullMQ Lua/reply compatibility with ioredis v6.
  protocol: 2,
})
const MASTER_SECRET = process.env.MASTER_SECRET || ''
const MASTER_SECRET_PREVIOUS = process.env.MASTER_SECRET_PREVIOUS
const ptyIdleTimeoutMs = Number(process.env.PTY_IDLE_TIMEOUT_MS ?? 900000) // 15 min

export function startWsServer(port: number = 8080) {
  const wss = new WebSocketServer({ port })

  wss.on('connection', async (ws: WebSocket, req) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const ticket = url.searchParams.get('ticket')
    const token = url.searchParams.get('token')

    if (ticket) {
      await handlePtyConnection(ws, ticket)
      return
    }

    if (token) {
      await handleJobSubscription(ws, token)
      return
    }

    ws.close(1008, 'Ticket or token required')
  })

  logger.info({ port }, 'WebSocket server listening')
}

async function handleJobSubscription(ws: WebSocket, token: string) {
  const session = await validateSessionToken(token)
  if (!session) {
    ws.close(1008, 'Invalid session')
    return
  }

  const db = getDb()
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1)

  const memberships = await db
    .select({ groupId: userGroupMemberships.groupId })
    .from(userGroupMemberships)
    .where(eq(userGroupMemberships.userId, session.userId))

  addJobSubscriber({
    ws,
    userId: session.userId,
    role: user?.role ?? 'read_only',
    groupIds: new Set(memberships.map((m) => m.groupId)),
  })

  ws.send(JSON.stringify({ type: 'subscribed' }))
}

async function handlePtyConnection(ws: WebSocket, ticket: string) {
  try {
    const ticketPayloadSync = await redis.get(`pty_ticket:${ticket}`)
    if (!ticketPayloadSync) {
      ws.close(1008, 'Invalid or expired ticket')
      return
    }

    await redis.del(`pty_ticket:${ticket}`)
    const { server_id, user_id } = JSON.parse(ticketPayloadSync)
    logger.info({ server_id, user_id }, 'PTY ticket validated')

    const db = getDb()
    const [server] = await db.select().from(servers).where(eq(servers.id, server_id)).limit(1)
    if (!server) throw new Error('Server not found')

    const [credsRow] = await db
      .select()
      .from(credentials)
      .where(eq(credentials.serverId, server_id))
      .limit(1)
    if (!credsRow) throw new Error('Credentials not found')

    const decrypted = decryptBlob(
      bufferFromDb(credsRow.encryptedBlob as Buffer),
      bufferFromDb(credsRow.iv as Buffer),
      bufferFromDb(credsRow.authTag as Buffer),
      MASTER_SECRET,
      credsRow.keyVersion,
      MASTER_SECRET_PREVIOUS || undefined,
      credsRow.keyVersion >= 2 ? aadFor(credsRow.id, 'cred', credsRow.keyVersion) : undefined
    )

    const conn = new SSHClient()
    let fingerprintToStore: string | null = null

    conn
      .on('ready', () => {
        if (fingerprintToStore) {
          const { enc, iv, tag } = encServerField(fingerprintToStore, server_id, MASTER_SECRET)
          db.update(servers)
            .set({ hostKeyFpEnc: enc, hostKeyFpIv: iv, hostKeyFpTag: tag, encVersion: 1 })
            .where(eq(servers.id, server_id))
            .then()
        }

        conn.shell({ term: 'xterm-color' }, async (err, stream) => {
          if (err) {
            ws.close(1011, 'Shell request failed')
            return conn.end()
          }

          ws.send(JSON.stringify({ type: 'ready' }))
          ptySessionsActive.inc()

          // Audit-log the interactive session (open + close timestamps).
          let sessionId: string | null = null
          try {
            const [s] = await db
              .insert(interactiveSessions)
              .values({ serverId: server_id, userId: user_id })
              .returning({ id: interactiveSessions.id })
            sessionId = s?.id ?? null
          } catch (e) {
            logger.error({ err: (e as Error).message }, 'interactive_sessions insert failed')
          }

          // Idempotent teardown — runs exactly once whether the client, the shell,
          // or the idle timer ends the session. Fixes the gauge double/never-dec.
          let torn = false
          const teardown = () => {
            if (torn) return
            torn = true
            ptySessionsActive.dec()
            clearTimeout(idleTimer)
            conn.end()
            if (sessionId) {
              db.update(interactiveSessions)
                .set({ closedAt: new Date() })
                .where(eq(interactiveSessions.id, sessionId))
                .then()
                .catch(() => {})
            }
          }

          // Idle timeout: reset on any activity, close after inactivity.
          let idleTimer: ReturnType<typeof setTimeout>
          const resetIdle = () => {
            clearTimeout(idleTimer)
            idleTimer = setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) ws.close(4000, 'Idle timeout')
              teardown()
            }, ptyIdleTimeoutMs)
          }
          resetIdle()

          stream.on('data', (data: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(data)
          })

          ws.on('message', (message) => {
            resetIdle()
            try {
              const textMsg = message.toString('utf8')
              if (textMsg.startsWith('{') && textMsg.includes('"type":"resize"')) {
                const { cols, rows } = JSON.parse(textMsg)
                stream.setWindow(rows, cols, 0, 0)
                return
              }
            } catch {
              /* raw input */
            }
            stream.write(message)
          })

          stream.on('close', () => {
            if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'Process exited')
            teardown()
          })

          ws.on('close', teardown)
        })
      })
      .on('error', (err) => {
        logger.error({ err: err.message }, 'PTY SSH connection error')
        if (ws.readyState === WebSocket.OPEN) ws.close(1011, 'SSH connection failed')
      })

    conn.connect({
      host: server.ipAddress,
      port: server.port,
      username: credsRow.username,
      privateKey: decrypted.ssh_auth_type === 'key' ? (decrypted.ssh_private_key as string) : undefined,
      passphrase:
        decrypted.ssh_auth_type === 'key' && decrypted.ssh_passphrase
          ? (decrypted.ssh_passphrase as string)
          : undefined,
      password: decrypted.ssh_auth_type === 'password' ? (decrypted.ssh_password as string) : undefined,
      readyTimeout: 10000,
      hostVerifier: (key: Buffer) => {
        const pinnedFp =
          server.encVersion >= 1
            ? decServerField(
                server.hostKeyFpEnc,
                server.hostKeyFpIv,
                server.hostKeyFpTag,
                server.id,
                MASTER_SECRET,
                MASTER_SECRET_PREVIOUS || undefined
              )
            : server.hostKeyFingerprint
        const result = verifyHostKey(key, pinnedFp)
        if (!result.ok) return false
        if (result.isNew) fingerprintToStore = result.fingerprint
        return true
      },
    })
  } catch (error) {
    const err = error as Error
    logger.error({ err: err.message }, 'PTY setup error')
    ws.close(1011, 'Internal Error')
  }
}
