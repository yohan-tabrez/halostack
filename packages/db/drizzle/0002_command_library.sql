-- Server-independent command library. saved_commands becomes a server<->command
-- binding so the same command can be reused across servers and by chains, and
-- survives deletion of any one server.

CREATE TABLE IF NOT EXISTS commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  command text NOT NULL,
  description text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,   -- declared {{var}} names
  interactive boolean NOT NULL DEFAULT false,     -- needs a PTY / may prompt
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- md5(command): a btree over raw command text can blow the 2704-byte index limit.
CREATE UNIQUE INDEX IF NOT EXISTS commands_name_command_uniq ON commands (name, md5(command));

ALTER TABLE saved_commands ADD COLUMN IF NOT EXISTS command_id uuid REFERENCES commands(id) ON DELETE CASCADE;

-- Migrate existing per-server rows into the library, deduping identical (name, command).
INSERT INTO commands (name, command, description, created_by, created_at)
SELECT DISTINCT ON (name, md5(command)) name, command, description, created_by, created_at
FROM saved_commands
ORDER BY name, md5(command), created_at ASC
ON CONFLICT DO NOTHING;

UPDATE saved_commands sc
SET command_id = c.id
FROM commands c
WHERE c.name = sc.name AND md5(c.command) = md5(sc.command) AND sc.command_id IS NULL;

ALTER TABLE saved_commands ALTER COLUMN command_id SET NOT NULL;

-- A command is bound to a server at most once.
CREATE UNIQUE INDEX IF NOT EXISTS saved_commands_server_command_uniq ON saved_commands (server_id, command_id);

-- name/command/description stay on saved_commands for now; current readers still
-- use them. Dropped in a later migration once readers move to the join.
