// Migrate credentials to v2 (hardened scrypt) + AAD bound to the credential id.
// Idempotent and resumable: rows already at keyVersion >= 2 are skipped, so a
// re-run after a partial failure finishes the job.
//
//   MASTER_SECRET=<current>  MASTER_SECRET_NEW=<strong>  node scripts/reencrypt.js
//
// Decrypts each row with the CURRENT secret at its stored version (no AAD for v1),
// re-encrypts under the NEW secret at v2 with AAD. Back up the database first — a
// partial run with a lost old secret is unrecoverable.
const path = require('path')
const postgres = require('postgres')
const { encryptBlob, decryptBlob, bufferFromDb, aadFor, encServerField } = require('../packages/crypto/dist')

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
} catch {}

async function main() {
  const oldSecret = process.env.MASTER_SECRET
  const newSecret = process.env.MASTER_SECRET_NEW
  if (!oldSecret || !newSecret) throw new Error('MASTER_SECRET and MASTER_SECRET_NEW are required')
  if (newSecret.length < 32) throw new Error('MASTER_SECRET_NEW must be at least 32 chars')

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')

  const sql = postgres(url, { max: 1, prepare: false })
  const rows = await sql`SELECT id, encrypted_blob, iv, auth_tag, key_version FROM credentials`

  let done = 0
  for (const row of rows) {
    if (row.key_version >= 2) {
      console.log(`skip credential ${row.id} (already v${row.key_version})`)
      continue
    }
    const decrypted = decryptBlob(
      bufferFromDb(row.encrypted_blob),
      bufferFromDb(row.iv),
      bufferFromDb(row.auth_tag),
      oldSecret,
      row.key_version
      // v1 has no AAD
    )
    const enc = encryptBlob(decrypted, newSecret, 2, aadFor(row.id, 'cred', 2))
    await sql`
      UPDATE credentials
      SET encrypted_blob = ${enc.encryptedBlob}, iv = ${enc.iv}, auth_tag = ${enc.authTag}, key_version = 2
      WHERE id = ${row.id}`
    done++
    console.log(`re-encrypted credential ${row.id} -> v2 + AAD`)
  }

  // Backfill server fields: encrypt any plaintext os_info + host_key_fingerprint.
  const srvRows = await sql`
    SELECT id, os_info, host_key_fingerprint, enc_version FROM servers WHERE enc_version < 1`
  let srvDone = 0
  for (const s of srvRows) {
    const set = {}
    if (s.host_key_fingerprint) {
      const e = encServerField(s.host_key_fingerprint, s.id, newSecret)
      Object.assign(set, { hk_enc: e.enc, hk_iv: e.iv, hk_tag: e.tag })
    }
    if (s.os_info) {
      const e = encServerField(JSON.stringify(s.os_info), s.id, newSecret)
      Object.assign(set, { os_enc: e.enc, os_iv: e.iv, os_tag: e.tag })
    }
    await sql`
      UPDATE servers SET
        host_key_fp_enc = ${set.hk_enc ?? null}, host_key_fp_iv = ${set.hk_iv ?? null}, host_key_fp_tag = ${set.hk_tag ?? null},
        os_info_enc = ${set.os_enc ?? null}, os_info_iv = ${set.os_iv ?? null}, os_info_tag = ${set.os_tag ?? null},
        os_info = NULL, host_key_fingerprint = NULL, enc_version = 1
      WHERE id = ${s.id}`
    srvDone++
    console.log(`encrypted server fields for ${s.id}`)
  }

  await sql.end()
  console.log(`Done. ${done} credential(s) upgraded, ${srvDone} server(s) field-encrypted.`)
  console.log('Now set MASTER_SECRET=<new>, MASTER_SECRET_PREVIOUS=<old> (one deploy, then drop PREVIOUS).')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
