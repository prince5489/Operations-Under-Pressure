CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS teams (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships (
  user_id INT REFERENCES users(id), team_id INT REFERENCES teams(id),
  role TEXT NOT NULL CHECK (role IN ('viewer','member','lead','admin')),
  PRIMARY KEY (user_id, team_id));
CREATE TABLE IF NOT EXISTS work_items (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '',
  type TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'open',
  team_id INT NOT NULL REFERENCES teams(id), assignee_id INT REFERENCES users(id),
  created_by INT NOT NULL REFERENCES users(id), due_date TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS items_team_idx ON work_items (team_id, id DESC);
CREATE INDEX IF NOT EXISTS items_assignee_idx ON work_items (assignee_id, id DESC);
CREATE INDEX IF NOT EXISTS items_urgent_idx ON work_items (id DESC) WHERE assignee_id IS NULL AND priority = 'urgent';
CREATE TABLE IF NOT EXISTS activity_events (
  id SERIAL PRIMARY KEY, item_id INT NOT NULL REFERENCES work_items(id), user_id INT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL, detail JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS activity_item_idx ON activity_events (item_id, id);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL, user_id INT NOT NULL, response JSONB, PRIMARY KEY (key, user_id));
