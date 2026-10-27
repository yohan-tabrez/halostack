const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const postgres = require('postgres')

const MIGRATIONS_DIR = path.join(__dirname, '..', 'packages', 'db', 'drizzle')

// Optional: a caller that already exported DATABASE_URL (CI, docker exec) needs no .env.
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
} catch {}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.log('No migrations found in packages/db/drizzle')
    return
  }

  // Migrations are idempotent (CREATE ... IF NOT EXISTS), so "already exists"
  // notices are expected and would otherwise drown the apply/skip log.
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `

    const applied = new Map(
      (await sql`SELECT name, checksum FROM schema_migrations`).map((r) => [r.name, r.checksum])
    )

    for (const name of files) {
      const body = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8')
      const checksum = crypto.createHash('sha256').update(body).digest('hex')
      const previous = applied.get(name)

      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `Migration ${name} was modified after it was applied (checksum mismatch). ` +
              'Add a new migration instead of editing an applied one.'
          )
        }
        console.log(`skip  ${name} (already applied)`)
        continue
      }

      // Each migration runs in its own transaction so a failure leaves no partial schema.
      await sql.begin(async (tx) => {
        await tx.unsafe(body)
        await tx`INSERT INTO schema_migrations (name, checksum) VALUES (${name}, ${checksum})`
      })
      console.log(`apply ${name}`)
    }

    console.log('Migrations up to date')
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
