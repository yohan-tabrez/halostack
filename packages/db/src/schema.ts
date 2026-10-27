import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  bigserial,
  pgEnum,
  index,
  primaryKey,
  unique,
  customType,
} from 'drizzle-orm/pg-core'

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

export const userRoleEnum = pgEnum('user_role', [
  'global_admin',
  'group_admin',
  'power_user',
  'read_only',
])

export const jobStatusEnum = pgEnum('job_status', [
  'queued',
  'running',
  'awaiting_input',
  'done',
  'failed',
  'cancelled',
])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('read_only'),
  // Bumped to invalidate JWTs (Credentials provider requires JWT strategy in Auth.js).
  sessionVersion: integer('session_version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const serverGroups = pgTable('server_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const userGroupMemberships = pgTable(
  'user_group_memberships',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => serverGroups.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.groupId] })]
)

export const servers = pgTable(
  'servers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').references(() => serverGroups.id, { onDelete: 'set null' }),
    hostname: text('hostname').notNull(),
    ipAddress: text('ip_address').notNull(),
    port: integer('port').notNull().default(22),
    osInfo: jsonb('os_info'),
    hostKeyFingerprint: text('host_key_fingerprint'),
    status: text('status').notNull().default('unknown'),
    lastSeen: timestamp('last_seen', { withTimezone: true }),
    addedBy: uuid('added_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Encrypted-at-rest variants (enc_version >= 1). See 0004 migration.
    osInfoEnc: bytea('os_info_enc'),
    osInfoIv: bytea('os_info_iv'),
    osInfoTag: bytea('os_info_tag'),
    hostKeyFpEnc: bytea('host_key_fp_enc'),
    hostKeyFpIv: bytea('host_key_fp_iv'),
    hostKeyFpTag: bytea('host_key_fp_tag'),
    encVersion: integer('enc_version').notNull().default(0),
  },
  (t) => [index('servers_group_id_idx').on(t.groupId)]
)

export const credentials = pgTable('credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  serverId: uuid('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' })
    .unique(),
  username: text('username').notNull(),
  encryptedBlob: bytea('encrypted_blob').notNull(),
  iv: bytea('iv').notNull(),
  authTag: bytea('auth_tag').notNull(),
  keyVersion: integer('key_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const commandJobs = pgTable(
  'command_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serverId: uuid('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade' }),
    issuedBy: uuid('issued_by').references(() => users.id, { onDelete: 'set null' }),
    command: text('command').notNull(),
    status: jobStatusEnum('status').notNull().default('queued'),
    stdout: text('stdout'),
    stderr: text('stderr'),
    exitCode: integer('exit_code'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    chainRunStepId: uuid('chain_run_step_id'),
    awaitingPrompt: text('awaiting_prompt'),
    awaitingSince: timestamp('awaiting_since', { withTimezone: true }),
  },
  (t) => [
    index('command_jobs_server_status_idx').on(t.serverId, t.status),
    index('command_jobs_queued_at_idx').on(t.queuedAt),
  ]
)

export const commands = pgTable('commands', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  command: text('command').notNull(),
  description: text('description'),
  variables: jsonb('variables').notNull().default([]),
  interactive: boolean('interactive').notNull().default(false),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const chains = pgTable('chains', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  graph: jsonb('graph').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const chainSteps = pgTable(
  'chain_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chainId: uuid('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    nodeKey: text('node_key').notNull(),
    commandId: uuid('command_id')
      .notNull()
      .references(() => commands.id, { onDelete: 'restrict' }),
    targetMode: text('target_mode').notNull().default('servers'),
    targetServerIds: uuid('target_server_ids').array().notNull().default([]),
    targetGroupId: uuid('target_group_id').references(() => serverGroups.id, {
      onDelete: 'set null',
    }),
    variables: jsonb('variables').notNull().default({}),
    continueOnFailure: boolean('continue_on_failure').notNull().default(false),
  },
  (t) => [unique('chain_steps_chain_node_uniq').on(t.chainId, t.nodeKey)]
)

export const chainEdges = pgTable(
  'chain_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chainId: uuid('chain_id')
      .notNull()
      .references(() => chains.id, { onDelete: 'cascade' }),
    fromNodeKey: text('from_node_key').notNull(),
    toNodeKey: text('to_node_key').notNull(),
    condition: text('condition').notNull().default('on_success'),
  },
  (t) => [unique('chain_edges_uniq').on(t.chainId, t.fromNodeKey, t.toNodeKey)]
)

export const chainRuns = pgTable('chain_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  chainId: uuid('chain_id').references(() => chains.id, { onDelete: 'set null' }),
  graphSnapshot: jsonb('graph_snapshot').notNull(),
  variables: jsonb('variables').notNull().default({}),
  status: text('status').notNull().default('running'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
})

export const chainRunSteps = pgTable(
  'chain_run_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => chainRuns.id, { onDelete: 'cascade' }),
    nodeKey: text('node_key').notNull(),
    serverId: uuid('server_id').references(() => servers.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('pending'),
    jobId: uuid('job_id').references(() => commandJobs.id, { onDelete: 'set null' }),
  },
  (t) => [unique('chain_run_steps_uniq').on(t.runId, t.nodeKey, t.serverId)]
)

export const interactiveSessions = pgTable('interactive_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  serverId: uuid('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
})

export const savedCommands = pgTable('saved_commands', {
  id: uuid('id').primaryKey().defaultRandom(),
  serverId: uuid('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  commandId: uuid('command_id').references(() => commands.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  command: text('command').notNull(),
  description: text('description'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorEmail: text('actor_email'),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    serverId: uuid('server_id'),
    groupId: uuid('group_id'),
    outcome: text('outcome').notNull().default('success'),
    severity: text('severity').notNull().default('info'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (t) => [
    index('audit_log_occurred_idx').on(t.occurredAt),
    index('audit_log_actor_idx').on(t.actorId, t.occurredAt),
  ]
)

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    prefix: text('prefix').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('api_keys_user_id_idx').on(t.userId)]
)

// Auth.js tables
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  expiresAt: integer('expires_at'),
  tokenType: text('token_type'),
  scope: text('scope'),
  idToken: text('id_token'),
  sessionState: text('session_state'),
})

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionToken: text('session_token').notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
})

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
})

export type UserRole = (typeof userRoleEnum.enumValues)[number]
export type JobStatus = (typeof jobStatusEnum.enumValues)[number]
