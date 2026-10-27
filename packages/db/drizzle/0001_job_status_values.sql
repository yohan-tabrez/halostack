-- New job_status values for interactive input and chain cancellation.
-- MUST be alone in its own migration: Postgres forbids using a newly-added enum
-- value in the same transaction that adds it, and scripts/migrate.js wraps each
-- file in one transaction.
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'awaiting_input';
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'cancelled';
