-- HALOStack initial schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('global_admin', 'group_admin', 'power_user', 'read_only');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('queued', 'running', 'done', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'read_only',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS server_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_group_memberships (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES server_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES server_groups(id) ON DELETE SET NULL,
  hostname text NOT NULL,
  ip_address text NOT NULL,
  port integer NOT NULL DEFAULT 22,
  os_info jsonb,
  host_key_fingerprint text,
  status text NOT NULL DEFAULT 'unknown',
  last_seen timestamptz,
  added_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS servers_group_id_idx ON servers(group_id);

CREATE TABLE IF NOT EXISTS credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL UNIQUE REFERENCES servers(id) ON DELETE CASCADE,
  username text NOT NULL,
  encrypted_blob bytea NOT NULL,
  iv bytea NOT NULL,
  auth_tag bytea NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS command_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  issued_by uuid REFERENCES users(id) ON DELETE SET NULL,
  command text NOT NULL,
  status job_status NOT NULL DEFAULT 'queued',
  stdout text,
  stderr text,
  exit_code integer,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS command_jobs_server_status_idx ON command_jobs(server_id, status);
CREATE INDEX IF NOT EXISTS command_jobs_queued_at_idx ON command_jobs(queued_at);

CREATE TABLE IF NOT EXISTS interactive_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS saved_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  command text NOT NULL,
  description text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Auth.js adapter tables
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  refresh_token text,
  access_token text,
  expires_at integer,
  token_type text,
  scope text,
  id_token text,
  session_state text
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier text NOT NULL,
  token text NOT NULL,
  expires timestamptz NOT NULL
);

-- Prevent updates to completed jobs (audit integrity)
CREATE OR REPLACE FUNCTION prevent_completed_job_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('done', 'failed') AND (
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.stdout IS DISTINCT FROM OLD.stdout OR
    NEW.stderr IS DISTINCT FROM OLD.stderr OR
    NEW.exit_code IS DISTINCT FROM OLD.exit_code OR
    NEW.command IS DISTINCT FROM OLD.command
  ) THEN
    RAISE EXCEPTION 'Completed command jobs are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS command_jobs_immutable ON command_jobs;
CREATE TRIGGER command_jobs_immutable
  BEFORE UPDATE ON command_jobs
  FOR EACH ROW EXECUTE FUNCTION prevent_completed_job_update();
