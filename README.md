<p align="center">
  <img src="brand/logo.png" alt="HALOStack" width="128" height="128" />
</p>

<h1 align="center">HALOStack</h1>

<p align="center">
  Centralized SSH server management — secure command execution, audit trails, and encrypted credentials at rest.
</p>

<p align="center">
  <a href="https://github.com/yohan-tabrez/halostack">github.com/yohan-tabrez/halostack</a>
  · Author: <a href="mailto:yohantabrez@gmail.com">yohantabrez@gmail.com</a>
</p>

---

## Prerequisites

| Tool | Version |
|------|---------|
| Docker Desktop | Latest |
| Node.js | 20 LTS (optional, for local dev outside Docker) |

## First-Time Setup

```powershell
# Copy environment template and fill in real secrets (no weak defaults)
Copy-Item .env.example .env
# Required: POSTGRES_PASSWORD, REDIS_PASSWORD, AUTH_SECRET, INTERNAL_AGENT_SECRET,
# WS_TOKEN_SECRET, MASTER_SECRET, BLIND_INDEX_SECRET, GRAFANA_ADMIN_PASSWORD
# Generate with: openssl rand -base64 32

# Start the full stack (Postgres, PgBouncer, Redis, Web, SSH Agent, Prometheus, Grafana)
docker compose up --build -d

# Open the app
Start-Process "http://localhost:8040"
```

On first visit, go to `/setup` to create the `global_admin` account.

## Daily Start / Stop

```powershell
docker compose up -d
docker compose down
```

## Services

| Service | URL / note |
|---------|------------|
| Web UI | http://localhost:8040 |
| SSH Agent WS | ws://localhost:8080 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:8001 |
| Postgres / PgBouncer / Redis | **Not published** by default (Docker network only) |

### Local port publishing (dev)

To reach Postgres, PgBouncer, and Redis from the host (e.g. running `web` outside Docker):

```powershell
docker compose -f docker-compose.yml -f docker-compose.devports.yml up -d
```

That overlay publishes `5432` (Postgres), `6432` (PgBouncer), and `6379` (Redis).

## Development (without Docker for web)

```powershell
npm install
npm run build --workspace=@halostack/crypto
npm run build --workspace=@halostack/db
docker compose -f docker-compose.yml -f docker-compose.devports.yml up -d postgres pgbouncer redis ssh-agent
$env:DATABASE_URL="postgresql://halostack:<POSTGRES_PASSWORD>@localhost:6432/halostack"
node scripts/migrate.js
cd web
npm run dev
```

## Key Rotation

```powershell
$env:MASTER_SECRET="old-secret"
$env:MASTER_SECRET_NEW="new-secret"
$env:DATABASE_URL="postgresql://halostack:<POSTGRES_PASSWORD>@localhost:6432/halostack"
node scripts/rotate-master-secret.js
```

Then update `MASTER_SECRET` and set `MASTER_SECRET_PREVIOUS` to the old value in `.env`.

## Brand assets

| File | Use |
|------|-----|
| `brand/logo-mark.svg` | Icon mark (SVG) |
| `brand/logo.svg` | Mark + wordmark |
| `brand/logo.png` | Marketing / README |
| `web/src/app/favicon.ico` | Browser favicon |
| `web/src/app/icon.svg` | App icon |
| `web/public/brand/*` | Served static brand files |

## Architecture

- **Auth.js** (Credentials) + **Drizzle** + **PostgreSQL** via **PgBouncer**
- **BullMQ** + **Valkey** for job queuing (high/low priority queues)
- **ssh-agent** handles SSH execution, connection pooling, host key TOFU, and shared WebSocket (job updates + PTY)
- App-layer RBAC (no Supabase, no RLS)
