-- Encrypt the two lower-traffic server fields at rest: os_info and
-- host_key_fingerprint. hostname/ip_address stay plaintext (they're needed for
-- lookup, indexing, and the SSH connect path). enc_version=0 means "still
-- plaintext"; the backfill in scripts/reencrypt.js flips rows to 1.

ALTER TABLE servers ADD COLUMN IF NOT EXISTS os_info_enc bytea;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS os_info_iv bytea;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS os_info_tag bytea;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS host_key_fp_enc bytea;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS host_key_fp_iv bytea;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS host_key_fp_tag bytea;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS enc_version integer NOT NULL DEFAULT 0;
