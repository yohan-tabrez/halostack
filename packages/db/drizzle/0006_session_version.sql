-- Credentials auth cannot use Auth.js database sessions (Auth.js requires JWT for
-- the Credentials provider). session_version lets admins revoke JWTs on demote/delete.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
