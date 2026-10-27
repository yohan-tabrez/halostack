const fs = require('fs')
const path = require('path')
const postgres = require('postgres')
const { encryptBlob, decryptBlob, bufferFromDb } = require('../packages/crypto/dist')

async function main() {
  const oldSecret = process.env.MASTER_SECRET
  const newSecret = process.env.MASTER_SECRET_NEW
  if (!oldSecret || !newSecret) {
    throw new Error('MASTER_SECRET and MASTER_SECRET_NEW are required')
  }

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')

  const sql = postgres(url, { max: 1, prepare: false })
  const rows = await sql`SELECT id, encrypted_blob, iv, auth_tag, key_version FROM credentials`

  for (const row of rows) {
    const decrypted = decryptBlob(
      bufferFromDb(row.encrypted_blob),
      bufferFromDb(row.iv),
      bufferFromDb(row.auth_tag),
      oldSecret,
      row.key_version
    )
    const nextVersion = row.key_version + 1
    const encrypted = encryptBlob(decrypted, newSecret, nextVersion)
    await sql`
      UPDATE credentials
      SET encrypted_blob = ${encrypted.encryptedBlob},
          iv = ${encrypted.iv},
          auth_tag = ${encrypted.authTag},
          key_version = ${nextVersion}
      WHERE id = ${row.id}
    `
    console.log(`Re-encrypted credential ${row.id} to version ${nextVersion}`)
  }

  await sql.end()
  console.log('Rotation complete. Set MASTER_SECRET to MASTER_SECRET_NEW and keep old secret as MASTER_SECRET_PREVIOUS.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
