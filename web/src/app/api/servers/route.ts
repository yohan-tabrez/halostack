import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { encryptBlob, aadFor } from '@halostack/crypto'
import { getDb, servers, credentials, userGroupMemberships } from '@/lib/db'
import { requireSession, isErrorResponse } from '@/lib/session'
import { canManageServers } from '@/lib/rbac'
import { scheduleServerHealth } from '@/lib/queue'
import { audit } from '@/lib/audit'
import { scopedServerIds } from '@/lib/scope'
import { internalError } from '@/lib/api-error'

export async function POST(request: Request) {
  try {
    const user = await requireSession()
    if (isErrorResponse(user)) return user
    if (!canManageServers(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const {
      hostname,
      ip_address,
      port = 22,
      groupId = null,
      username,
      sshAuthType,
      sshPrivateKey,
      sshPassphrase,
      sshPassword,
      sudoPassword,
    } = body

    if (!hostname || !ip_address || !username || (!sshPrivateKey && !sshPassword)) {
      return NextResponse.json({ error: 'Missing required configuration' }, { status: 400 })
    }

    // group_admin must place servers into a group they belong to (no ungrouped).
    if (user.role === 'group_admin') {
      if (!groupId) {
        return NextResponse.json({ error: 'group_admin must assign a group' }, { status: 400 })
      }
      const [m] = await getDb()
        .select({ groupId: userGroupMemberships.groupId })
        .from(userGroupMemberships)
        .where(
          and(
            eq(userGroupMemberships.userId, user.id),
            eq(userGroupMemberships.groupId, groupId)
          )
        )
        .limit(1)
      if (!m) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const credentialPayload = {
      ssh_auth_type: sshAuthType,
      ssh_private_key: sshPrivateKey || null,
      ssh_passphrase: sshPassphrase || null,
      ssh_password: sshPassword || null,
      sudo_password: sudoPassword || null,
    }

    const masterSecret = process.env.MASTER_SECRET
    if (!masterSecret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const db = getDb()

    const [server] = await db
      .insert(servers)
      .values({
        hostname,
        ipAddress: ip_address,
        port,
        groupId: groupId,
        addedBy: user.id,
        status: 'unknown',
      })
      .returning()

    // Pre-generate the credential id so the AAD can bind the blob to this exact row.
    const credId = randomUUID()
    const { encryptedBlob, iv, authTag, keyVersion } = encryptBlob(
      credentialPayload,
      masterSecret,
      2,
      aadFor(credId, 'cred', 2)
    )

    try {
      await db.insert(credentials).values({
        id: credId,
        serverId: server.id,
        username,
        encryptedBlob,
        iv,
        authTag,
        keyVersion,
      })
    } catch (credErr) {
      await db.delete(servers).where(eq(servers.id, server.id))
      throw credErr
    }

    // Best-effort: a scheduling hiccup shouldn't fail server registration.
    await scheduleServerHealth(server.id).catch((e) =>
      console.error('Failed to schedule health check:', e)
    )

    await audit({
      action: 'server.create',
      actorId: user.id,
      actorEmail: user.email,
      resourceType: 'server',
      resourceId: server.id,
      serverId: server.id,
      metadata: { hostname, ipAddress: ip_address },
    })

    return NextResponse.json({ server }, { status: 201 })
  } catch (error) {
    return internalError('Failed to register server', error)
  }
}

export async function GET() {
  const user = await requireSession()
  if (isErrorResponse(user)) return user

  const db = getDb()
  const allowed = await scopedServerIds(user)
  if (allowed === null) {
    const data = await db.select().from(servers)
    return NextResponse.json({ servers: data })
  }
  if (!allowed.size) return NextResponse.json({ servers: [] })
  const data = await db.select().from(servers).where(inArray(servers.id, [...allowed]))
  return NextResponse.json({ servers: data })
}
