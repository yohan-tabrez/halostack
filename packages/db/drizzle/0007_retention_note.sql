-- Retention (practical): ssh-agent monthly BullMQ job `purge-old-history` DELETEs
-- rows older than JOB_RETENTION_MONTHS (default 6) from command_jobs and audit_log.
-- Declarative monthly partitioning of existing tables is deferred — it requires a
-- table rewrite / dual-write cutover. When adopting partitions later:
--   1. CREATE TABLE ... PARTITION BY RANGE (queued_at / occurred_at)
--   2. Attach monthly child partitions; migrate data
--   3. Swap retention from DELETE to DETACH/DROP PARTITION
-- This migration is intentionally a no-op marker so schema_migrations records the note.
SELECT 1;
