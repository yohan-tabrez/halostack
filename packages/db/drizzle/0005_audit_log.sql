-- Real audit log (the designdoc treats it as a security control; previously the
-- /audit page just re-read command_jobs). Append-only; only grows.

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Denormalized: ON DELETE SET NULL on actor_id would otherwise erase who did
  -- what, defeating the log.
  actor_email text,
  action text NOT NULL,               -- e.g. 'command.execute', 'auth.login.failure'
  resource_type text,
  resource_id text,
  server_id uuid,
  group_id uuid,
  outcome text NOT NULL DEFAULT 'success',  -- success | failure
  severity text NOT NULL DEFAULT 'info',    -- info | warn | alert
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_log_occurred_idx ON audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_alert_idx ON audit_log (occurred_at DESC) WHERE severity IN ('warn', 'alert');
