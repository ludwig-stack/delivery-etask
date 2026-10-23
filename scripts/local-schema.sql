CREATE TABLE IF NOT EXISTS delivery_events (
 id TEXT PRIMARY KEY NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 version INTEGER NOT NULL, payload TEXT NOT NULL, actor_id TEXT NOT NULL,
 actor_name TEXT NOT NULL, at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_entity_version ON delivery_events(entity_type,entity_id,version);
CREATE INDEX IF NOT EXISTS delivery_events_at ON delivery_events(at);
CREATE TABLE IF NOT EXISTS auth_attempts (identifier TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS auth_attempts_identifier_at ON auth_attempts(identifier,at);
