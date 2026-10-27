# HALOStack — Design Document

## Overview

HALOStack is a Linux web application for secure, centralized management of software and commands across multiple Ubuntu servers. It provides a role-controlled dashboard for executing commands, monitoring servers, and auditing activity — all over SSH.

The stack is built entirely on **free and open-source** software, with no external service dependencies — everything runs in Docker Compose.

---

## Tech Stack


| Layer                 | Technology                                                                       | License            |
| --------------------- | -------------------------------------------------------------------------------- | ------------------ |
| Frontend              | Next.js 14 (App Router) + Shadcn UI + Tailwind CSS                               | MIT                |
| Language              | TypeScript (full-stack)                                                          | Apache 2.0         |
| Database              | PostgreSQL (self-hosted)                                                         | PostgreSQL License |
| Connection Pooling    | PgBouncer (transaction pooling mode)                                             | ISC                |
| ORM / Migrations      | Prisma or Drizzle                                                                | Apache 2.0 / MIT   |
| Auth                  | Auth.js (NextAuth) — Credentials provider + Postgres adapter                     | ISC                |
| Realtime Updates      | Shared WebSocket server (`ws` library) — job status pushed directly by SSH Agent | MIT                |
| SSH Execution         | Node.js microservice — `ssh2` library                                            | MIT                |
| Job Queue             | BullMQ + Redis (or Valkey)                                                       | MIT / BSD          |
| Credential Encryption | AES-256-GCM via Node.js `crypto` (built-in)                                      | N/A                |
| Observability         | OpenTelemetry + Prometheus + Grafana OSS                                         | Apache 2.0 / AGPL  |
| Deployment            | Docker + Docker Compose                                                          | Apache 2.0         |


> **Note on Supabase:** an earlier version of this design used Supabase for Auth + Postgres + Realtime. It was replaced with plain Postgres + Auth.js + a shared WebSocket server. HALOStack is a small, fixed-role internal tool where the browser never talks to the database directly (everything is brokered through Next.js API routes), so Supabase's core value-adds — Row Level Security for direct client-to-DB access, and a bundled BaaS for multi-tenant auth — weren't being used. Dropping it removes ~6 extra containers (GoTrue, Realtime, Kong, Studio, etc.) from the self-hosted deployment and one external dependency to patch/upgrade.

---



## Architecture Overview

```
Browser (Next.js)
      │
      │ HTTPS + WSS
      ▼
Next.js API Routes / Server Actions
      │                    │
      │                    │ WebSocket (job status push)
      ▼                    ▼
PostgreSQL (via PgBouncer)  ◄──── SSH Agent Service (Node.js)
  Auth.js sessions                      │
                                   BullMQ Queue
                                        │
                                      Redis
                                        │
                              ssh2 SSH connections (pooled)
                                        │
                               Remote Ubuntu Servers
```

**Key principle:** Next.js handles the web tier and short API calls. A separate, always-on **SSH Agent microservice** handles all persistent SSH communication and job processing. Status updates flow back to the frontend over a **shared WebSocket server** — the same one used for the interactive terminal feature — so there's no separate realtime subsystem to run.

---



## Security Architecture



### Authentication & Authorization

- **Auth.js (NextAuth)** with a Credentials provider (email/password) and a Postgres adapter for session storage
- **RBAC roles** enforced at the application layer — in Next.js API routes / server actions — rather than via database-level Row Level Security. This is a deliberate simplification: the browser never has a direct connection to Postgres in this architecture (all access is brokered through Next.js), so app-layer checks provide the same guarantee with far less operational complexity than maintaining RLS policies
- Roles defined in the `users` table:


| Role           | Capabilities                                         |
| -------------- | ---------------------------------------------------- |
| `global_admin` | Full access to all servers, users, and settings      |
| `group_admin`  | Manage servers and users within their assigned group |
| `power_user`   | Execute commands; cannot add/remove servers          |
| `read_only`    | View dashboards and logs only                        |




### Credential Management

SSH credentials (private keys, passwords) are **never stored in plaintext**.

- **Encryption:** AES-256-GCM using Node.js built-in `crypto` module
- **Key derivation:** Encryption keys are derived from a `MASTER_SECRET` environment variable — never stored in the database
- **Key rotation:** Each `credentials` row carries a `key_version` column. Rotating `MASTER_SECRET` is done by introducing a new version and re-encrypting rows in a background job, rather than a hard cutover that invalidates every stored credential at once
- Encrypted blobs are stored in the `credentials` table in Postgres
- **Write-time encryption:** Next.js encrypts credential payloads (AES-256-GCM) when servers are created or credentials are updated
- **Runtime decryption:** the SSH Agent decrypts blobs only to open SSH sessions — never in the browser; Next.js does not decrypt for command execution



### Zero Trust Principles

- All API routes validate the Auth.js session/JWT on every request
- SSH Agent only accepts job payloads signed internally (shared secret between Next.js and the Agent)
- No direct browser-to-SSH communication — all commands are brokered through the job queue
- SSH host keys are pinned on first connection (TOFU) and verified on every subsequent connection — see [Server Management](#server-management)
- Audit log written on every command execution (who, what, which server, timestamp, result)

---



## Database Schema (PostgreSQL)



### `users`

```sql
id              uuid primary key default gen_random_uuid()
email           text unique not null
password_hash   text not null
role            text not null default 'read_only'
created_at      timestamptz default now()
```



### `server_groups`

```sql
id          uuid primary key default gen_random_uuid()
name        text not null
created_by  uuid references users(id)
created_at  timestamptz default now()
```



### `servers`

```sql
id                  uuid primary key default gen_random_uuid()
group_id            uuid references server_groups(id)
hostname            text not null
ip_address          inet not null
port                integer default 22
os_info             jsonb
host_key_fingerprint text            -- pinned on first connect (TOFU), verified on every subsequent connection
status              text default 'unknown'  -- unknown | reachable | unreachable
last_seen           timestamptz
added_by            uuid references users(id)
created_at          timestamptz default now()
```

*Index:* `servers(group_id)` *— used by group fan-out lookups.*

### `credentials`

```sql
id              uuid primary key default gen_random_uuid()
server_id       uuid references servers(id)
username        text not null
encrypted_blob  bytea not null   -- AES-256-GCM encrypted JSON blob (see below)
iv              bytea not null   -- per-credential initialization vector
auth_tag        bytea not null   -- GCM auth tag
key_version     integer not null default 1   -- which MASTER_SECRET version encrypted this row
created_at      timestamptz default now()
```

The `encrypted_blob` decrypts to a JSON object with the following structure:

```json
{
  "ssh_auth_type": "key",
  "ssh_private_key": "-----BEGIN OPENSSH PRIVATE KEY-----...",
  "ssh_passphrase": "optional passphrase or null",
  "sudo_password": "the sudo password, or null if not required"
}
```

> `ssh_auth_type` is either `"key"` (private key) or `"password"` (plain SSH password).
> `sudo_password` is stored here — never in a separate column — so it is always encrypted at rest alongside the SSH credentials.



### `command_jobs`

```sql
id              uuid primary key default gen_random_uuid()
server_id       uuid references servers(id)
issued_by       uuid references users(id)
command         text not null
status          text default 'queued'  -- queued | running | done | failed
stdout          text     -- truncated at a configurable cap (default 256 KB); marked if truncated
stderr          text     -- same truncation policy as stdout
exit_code       integer
queued_at       timestamptz default now()
completed_at    timestamptz
```

*Indexes:* `command_jobs(server_id, status)` *and* `command_jobs(queued_at)` *— support the per-server history view and the* `/jobs` *live feed without full table scans.*

*Retention:* `command_jobs` *and the audit log table are partitioned by month (native Postgres declarative partitioning). A scheduled job drops or archives partitions older than the configured retention window, keeping query performance stable as history grows.*

### `interactive_sessions`

```sql
id          uuid primary key default gen_random_uuid()
server_id   uuid references servers(id)
user_id     uuid references users(id)
opened_at   timestamptz default now()
closed_at   timestamptz
```



### `user_group_memberships`

```sql
user_id   uuid references users(id) on delete cascade
group_id  uuid references server_groups(id) on delete cascade
primary key (user_id, group_id)
```

*Scopes* `group_admin` *users to specific server groups.*

### `saved_commands`

```sql
id          uuid primary key default gen_random_uuid()
server_id   uuid references servers(id)
name        text not null
command     text not null
description text
created_by  uuid references users(id)
created_at  timestamptz default now()
```

*Per-server command library (retained from MVP).*

Access control for all tables is enforced in the Next.js API layer based on the requesting user's `role` and group memberships — see [Authentication & Authorization](#authentication--authorization).

---



## SSH Agent Microservice

A standalone Node.js process that runs alongside the Next.js app in Docker Compose.

### Responsibilities

- Dequeue jobs from **BullMQ** (backed by **Redis/Valkey**)
- Decrypt SSH credentials at runtime using the appropriate `MASTER_SECRET` version (via `key_version`)
- Maintain a **pool of open, authenticated SSH connections per server** (idle-timeout eviction after a few minutes), reused across jobs instead of opening a fresh connection per command
- Execute commands, capture stdout/stderr/exit code
- Write results back to the `command_jobs` table
- Push the status update directly over the shared WebSocket server the moment the row is written — no separate realtime subscription layer needed



### Why a separate service?

- SSH connections are **stateful and long-lived** — not suited for stateless Next.js routes
- Allows retry logic, concurrency limits, and back-pressure via BullMQ
- Isolated process boundary: a crash in SSH handling doesn't take down the web tier
- Connection pooling per server significantly cuts handshake/auth overhead for repeated or fan-out commands



### Job Flow

```
1. User submits command via dashboard
2. Next.js API Route validates auth, writes job to `command_jobs` (status: queued)
   and enqueues a BullMQ job with the server_id + command_job_id
3. SSH Agent dequeues the BullMQ job
4. Agent fetches + decrypts credentials from Postgres
5. Agent reuses a pooled SSH connection (or opens + pools a new one) and runs the command (see Sudo section below)
6. Agent updates `command_jobs` row with stdout/stderr/exit_code/status
7. Agent pushes the update over the shared WebSocket server
8. Dashboard updates live without polling
```



### Sudo Command Execution

All privileged commands are run fully automatically using `sudo -S`, which reads the password from stdin — no TTY or human interaction required.

**How the SSH Agent wraps a command:**

```
original command:   apt install nginx
wrapped command:    sudo -S -p '' apt install nginx
```

- `-S` — read password from stdin instead of opening a TTY prompt
- `-p ''` — suppress the password prompt string (avoids it appearing in stdout)

**stdin injection via** `ssh2`**:**

```js
ssh.exec("sudo -S -p '' apt install nginx", (err, stream) => {
  // Write the sudo password immediately to stdin, then close it
  stream.stdin.write(credentials.sudo_password + "\n");
  stream.stdin.end();

  stream.on("data", (data) => { stdout += data; });
  stream.stderr.on("data", (data) => { stderr += data; });
  stream.on("close", (code) => {
    // Update command_jobs row with stdout, stderr, exit_code, status
  });
});
```

**Important guards in the Agent:**

- If `sudo_password` is `null` in the decrypted blob, the command is run as-is without `sudo -S` wrapping
- If the command string already starts with `sudo`, it is not double-wrapped
- Sudo password is **never logged**, never appears in `stdout`/`stderr` stored to the DB, and is zeroed from memory after use
- A failed sudo attempt (exit code `1` with `incorrect password` in stderr) is flagged as a permanent failure — no retry, and an audit log entry is written so the admin knows to update the credential

---



## Server Management

- **Manual registration:** Admins add servers by entering IP/hostname, port, and SSH credentials. This is the primary method.
- **Host key verification (TOFU):** On first connection, the SSH Agent captures the server's SSH host key fingerprint and stores it in `servers.host_key_fingerprint`. Every subsequent connection verifies the presented host key against the pinned fingerprint; a mismatch blocks the connection and raises an audit alert instead of silently proceeding — closing a MITM gap and catching accidental hostname/IP reuse.
- **Server groups:** Servers are organized into groups. Admins can broadcast a command to all servers in a group (fan-out jobs via BullMQ).
- **Health checks:** The SSH Agent runs periodic lightweight SSH pings (default: every 5 minutes per server) to update `last_seen` and `os_info`. Health-check jobs run on a **separate, lower-priority BullMQ queue** from user-issued commands, so a burst of scheduled pings can't delay a user's "Run Command" action.
- **Network scanning (future):** Deferred to a later phase. Requires careful scoping, permission controls, and network access — not suitable for v1.

---



## Frontend — Key Pages


| Route           | Description                               |
| --------------- | ----------------------------------------- |
| `/`             | Dashboard: server status overview         |
| `/servers`      | List all servers; add/edit/remove         |
| `/servers/[id]` | Server detail: run commands, view history |
| `/groups`       | Manage server groups                      |
| `/jobs`         | Real-time command job feed                |
| `/audit`        | Full audit log (admin only)               |
| `/settings`     | User management, API keys                 |


Read-heavy, mostly-static pages (`/servers`, `/groups`) use React Server Components with short revalidation windows rather than client-side refetching; only genuinely live data (job status, `last_seen`) flows over the WebSocket layer. Dashboard clients subscribe to **scoped channels** (per-user / per-group) rather than the full `command_jobs` firehose, filtered server-side rather than in the browser.

---



## Background Job Queue (BullMQ + Redis)

- **BullMQ** (MIT licensed) provides job queuing, retries, concurrency, and a worker API
- **Redis** (BSD) or **Valkey** (BSD, Redis OSS fork) acts as the queue backend
- Jobs have configurable retry count and backoff for transient SSH failures
- **Separate queues by priority:** user-issued commands run on a high-priority queue; scheduled health checks run on a low-priority queue, so routine pings never starve interactive use
- A **BullMQ Board** (self-hosted, free) can optionally be added for job monitoring UI
- BullMQ workers (SSH Agent instances) scale horizontally — running multiple Agent instances is the designed path for managing more servers than a single instance's `SSH_CONCURRENCY` can handle, rather than raising that limit indefinitely on one instance

---



## Observability


| Concern            | Tool                                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| Structured logging | `pino` (Node.js, MIT) — JSON logs from both Next.js and SSH Agent       |
| Metrics collection | Prometheus (Apache 2.0) scrapes from a `/metrics` endpoint              |
| Visualization      | Grafana OSS (AGPL) — dashboards for job throughput, SSH errors, latency |
| Tracing            | OpenTelemetry SDK (Apache 2.0) — traces across Next.js → SSH Agent      |
| Alerting           | Grafana alerting rules (built-in, free)                                 |


All components run locally in Docker Compose — no paid or external services required.

---



## Deployment (Docker Compose)

```yaml
services:
  web:         # Next.js app
  ssh-agent:   # SSH Agent microservice
  postgres:    # PostgreSQL database
  pgbouncer:   # Connection pooler in front of postgres
  redis:       # BullMQ backend (or valkey image)
  prometheus:  # Metrics scraper
  grafana:     # Dashboards
```

Fully self-contained — no external dependencies. Everything runs on your own infrastructure.

---

## Development Phases



### Phase 1 — Foundation

- Postgres + PgBouncer setup; schema and initial migrations
- Auth.js integration (Credentials provider, session storage)
- Next.js scaffold with Shadcn UI
- Manual server registration UI
- Basic AES-256 credential storage



### Phase 2 — SSH Execution

- SSH Agent microservice with BullMQ, including per-server connection pooling
- Single-server command execution
- Live job status via the shared WebSocket server
- Host key TOFU pinning and verification



### Phase 3 — Group Operations & Audit

- Fan-out command execution (server groups)
- Full audit log UI
- Health check scheduler on its own low-priority queue



### Phase 4 — Observability & Hardening

- Prometheus + Grafana dashboards
- OpenTelemetry tracing
- `command_jobs` / audit log partitioning and retention job
- `MASTER_SECRET` key rotation tooling
- Security audit and penetration testing prep
- Rate limiting and anomaly detection on command execution

---



## Additional Considerations

- All dependencies are free and open-source and self-hosted — no paid SDKs, SaaS services, or external dependencies of any kind
- SSH private keys are never logged, never sent to the frontend, and never stored unencrypted
- All `command_jobs` entries are immutable once completed — audit integrity
- Regular dependency updates via Dependabot (GitHub, free)

---



## Environment Variables

All secrets and environment-specific configuration are passed via environment variables. No secrets live in source code or the database.

### Next.js (`web` service)


| Variable                | Description                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Postgres connection string, pointed at PgBouncer (e.g. `postgresql://...@pgbouncer:6432/halostack`) |
| `AUTH_SECRET`           | Auth.js session signing secret                                                                      |
| `INTERNAL_AGENT_SECRET` | Shared secret used to sign job payloads sent to SSH Agent                                           |
| `REDIS_URL`             | Redis/Valkey connection string (e.g. `redis://redis:6379`)                                          |
| `WS_INTERNAL_URL`       | Internal URL the SSH Agent uses to push status updates into the shared WebSocket server             |




### SSH Agent (`ssh-agent` service)


| Variable                   | Description                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `MASTER_SECRET`            | Current 256-bit key used to derive AES-256-GCM encryption keys for credentials                         |
| `MASTER_SECRET_PREVIOUS`   | Prior key version(s), kept available during a rotation window for decrypting not-yet-re-encrypted rows |
| `DATABASE_URL`             | Postgres connection string (via PgBouncer), same as above                                              |
| `INTERNAL_AGENT_SECRET`    | Must match the value set in the Next.js service                                                        |
| `REDIS_URL`                | Redis/Valkey connection string                                                                         |
| `SSH_CONCURRENCY`          | Max simultaneous SSH connections (default: `10`)                                                       |
| `SSH_POOL_IDLE_TIMEOUT_MS` | How long an idle pooled SSH connection is kept open before eviction (default: `300000`)                |
| `JOB_TIMEOUT_MS`           | Max time (ms) a job can run before being killed (default: `60000`)                                     |
| `STDOUT_CAP_BYTES`         | Max captured stdout/stderr size per job before truncation (default: `262144`)                          |


---



## Error Handling & Resilience



### SSH Failures

- **Connection refused / timeout:** BullMQ retries the job with exponential backoff (3 attempts by default). After all retries are exhausted, the `command_jobs` row is marked `failed` with the error message in `stderr`.
- **Authentication failure:** Treated as a permanent failure (no retry) — the job fails immediately and an alert is raised in the audit log so the admin can check credentials.
- **Host key mismatch:** Treated as a permanent failure (no retry) — connection is refused outright and a high-severity audit alert is raised.
- **Mid-session disconnect:** The `ssh2` `close` event is handled; partial stdout/stderr captured so far is saved before the job is marked `failed`. A dead pooled connection is evicted rather than reused.



### Server Unavailability

- Health check pings run on a schedule (default: every 5 minutes per server), on their own low-priority queue. If a server fails 3 consecutive pings, its status in the `servers` table is set to `unreachable`.
- The UI shows an `unreachable` badge and disables the "Run Command" button until the server recovers.
- Queued jobs targeting an `unreachable` server are held in BullMQ and not dequeued until the server comes back online (checked via health ping).



### Queue Resilience

- Redis is configured with `appendonly yes` for persistence (AOF) so the queue survives a Redis restart.
- BullMQ's `removeOnComplete` and `removeOnFail` are set to rolling window limits (e.g. keep last 500) to prevent unbounded queue growth.
- Separate high/low-priority queues (user commands vs. health checks) prevent scheduled work from starving interactive requests.

---



## Interactive Terminal (PTY Support)

Command execution in the dashboard covers one-shot commands (non-interactive). For use cases requiring a live interactive shell (`top`, `htop`, `vim`, package managers, etc.), an optional **Web Terminal** feature is added.

### How it works

- **Frontend:** `xterm.js` (MIT) renders a terminal emulator in the browser. Resizing is handled via the `FitAddon`.
- **Transport:** A WebSocket connection is opened from the browser to the same shared WebSocket server used for job status updates (using the `ws` library, MIT).
- **SSH Agent:** Receives the WebSocket stream and opens a **PTY channel** via `ssh2`'s `shell()` method instead of `exec()`.
- Data flows bidirectionally: keystrokes go browser → WebSocket → ssh2 PTY → server; output goes server → ssh2 → WebSocket → xterm.js.
- Terminal resize events (`SIGWINCH`) are propagated using `ssh2`'s `setWindow()` call.



### Security

- PTY sessions are authenticated by the same Auth.js session as regular API calls
- Only users with `power_user` or `global_admin` roles can open a PTY session
- Each PTY session is logged (opened/closed timestamps, user) in the `interactive_sessions` audit table
- Idle PTY sessions are terminated after a configurable timeout (default: 15 minutes)

---



## Testing Strategy



### Unit Tests — `vitest` (MIT)

- Credential encryption/decryption round-trips, including cross-`key_version` decryption during rotation
- BullMQ job payload construction and validation
- RBAC permission logic in the API layer



### Integration Tests — `vitest` + `testcontainers` (Apache 2.0)

- SSH Agent spun up against a real SSH server in a Docker container (`linuxserver/openssh-server`, free)
- Test full job flow: enqueue → SSH Agent picks up → executes on mock server → result written to DB
- Credential encryption/decryption with a real AES key
- Postgres integration tests run against a real `testcontainers`-managed Postgres instance



### End-to-End Tests — `Playwright` (Apache 2.0)

- Login and role-based access (admin vs read-only)
- Add a server, run a command, verify the job result appears in the dashboard
- Audit log reflects the executed command



### CI Pipeline (GitHub Actions — free tier)

```
on: [push, pull_request]
jobs:
  lint:     eslint + tsc --noEmit
  unit:     vitest run
  e2e:      playwright test (against local Docker Compose stack)
```

---



## Performance & Efficiency Considerations

A consolidated list of changes made to the initial design specifically for performance and resource efficiency:

1. **Connection pooling (PgBouncer):** Prevents the app tier from exhausting Postgres `max_connections` under load; runs in transaction-pooling mode between Next.js/SSH Agent and Postgres.
2. **SSH connection reuse:** The Agent maintains a pool of open, authenticated SSH connections per server instead of a fresh handshake per job — the single biggest latency win for fan-out and repeated commands.
3. **Targeted indexes:** `command_jobs(server_id, status)`, `command_jobs(queued_at)`, `servers(group_id)` avoid full table scans on the job feed and group operations.
4. **Output capping:** `stdout`/`stderr` are truncated at a configurable byte cap rather than stored unbounded, avoiding oversized rows from verbose or runaway commands.
5. **Partitioning & retention:** `command_jobs` and audit logs are partitioned by month with a scheduled archival/drop job, keeping query performance stable as history accumulates.
6. **Priority queues:** Health-check pings run on a separate, lower-priority BullMQ queue so scheduled work never delays user-issued commands.
7. **Host key pinning (TOFU):** Closes a MITM gap and catches accidental hostname/IP reuse at negligible runtime cost.
8. **Key rotation support:** `key_version` on `credentials` allows `MASTER_SECRET` rotation via background re-encryption instead of a hard, disruptive cutover.
9. **Scoped realtime channels:** Clients subscribe to per-user/per-group channels rather than filtering a full-table firehose client-side.
10. **RSC + short revalidation for static views:** `/servers` and `/groups` avoid refetching on every interaction; only genuinely live fields ride the WebSocket layer.
11. **Horizontal scaling path:** BullMQ workers (SSH Agent instances) scale out naturally — documented as the answer to growing server counts rather than raising `SSH_CONCURRENCY` indefinitely on one instance.

