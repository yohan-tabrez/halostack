-- Command chains: a DAG of steps, each targeting one or more servers, that run
-- when their predecessors are satisfied. State lives in the DB; the agent just
-- advances it (see ssh-agent/src/lib/chain-engine.ts).

CREATE TABLE IF NOT EXISTS chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  graph jsonb NOT NULL DEFAULT '{}'::jsonb,   -- editor fidelity: node positions, viewport
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chain_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  node_key text NOT NULL,                       -- stable id within the graph
  -- RESTRICT: a command referenced by a chain can't be deleted out from under it.
  command_id uuid NOT NULL REFERENCES commands(id) ON DELETE RESTRICT,
  target_mode text NOT NULL DEFAULT 'servers',  -- 'servers' | 'group'
  target_server_ids uuid[] NOT NULL DEFAULT '{}',
  target_group_id uuid REFERENCES server_groups(id) ON DELETE SET NULL,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb, -- per-step variable overrides
  continue_on_failure boolean NOT NULL DEFAULT false,
  UNIQUE (chain_id, node_key)
);

CREATE TABLE IF NOT EXISTS chain_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
  from_node_key text NOT NULL,
  to_node_key text NOT NULL,
  condition text NOT NULL DEFAULT 'on_success'
    CHECK (condition IN ('on_success', 'on_failure', 'always')),
  UNIQUE (chain_id, from_node_key, to_node_key)
);

CREATE TABLE IF NOT EXISTS chain_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id uuid REFERENCES chains(id) ON DELETE SET NULL,
  -- Snapshot of steps+edges at launch, so editing the chain never mutates a live run.
  graph_snapshot jsonb NOT NULL,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'done', 'failed', 'cancelled')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS chain_runs_status_idx ON chain_runs (status);

CREATE TABLE IF NOT EXISTS chain_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES chain_runs(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  server_id uuid REFERENCES servers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'queued', 'running', 'awaiting_input', 'done', 'failed', 'skipped', 'cancelled')),
  job_id uuid REFERENCES command_jobs(id) ON DELETE SET NULL,
  UNIQUE (run_id, node_key, server_id)
);
CREATE INDEX IF NOT EXISTS chain_run_steps_run_idx ON chain_run_steps (run_id);

-- Link a command job back to the chain step that spawned it (null for ad-hoc jobs),
-- plus interactive-prompt state.
ALTER TABLE command_jobs ADD COLUMN IF NOT EXISTS chain_run_step_id uuid REFERENCES chain_run_steps(id) ON DELETE SET NULL;
ALTER TABLE command_jobs ADD COLUMN IF NOT EXISTS awaiting_prompt text;
ALTER TABLE command_jobs ADD COLUMN IF NOT EXISTS awaiting_since timestamptz;
