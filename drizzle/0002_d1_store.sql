-- Additive migration: preserves the original delivery_events table and history.
CREATE TABLE IF NOT EXISTS dsi_store_metadata (
 id INTEGER PRIMARY KEY CHECK(id=1),
 revision INTEGER NOT NULL CHECK(revision>=0),
 updated_at TEXT NOT NULL,
 import_guard INTEGER NOT NULL DEFAULT 0 CHECK(import_guard=0)
);
INSERT OR IGNORE INTO dsi_store_metadata (id,revision,updated_at)
SELECT 1,count(*),coalesce(max(at),strftime('%Y-%m-%dT%H:%M:%fZ','now')) FROM delivery_events;

CREATE TRIGGER IF NOT EXISTS dsi_event_version BEFORE INSERT ON delivery_events
BEGIN
 SELECT CASE WHEN NEW.version != coalesce((SELECT max(version) FROM delivery_events WHERE entity_type=NEW.entity_type AND entity_id=NEW.entity_id),0)+1
 THEN RAISE(ABORT,'DSI_VERSION_CONFLICT') END;
 SELECT CASE WHEN NEW.entity_type NOT IN ('task','milestone','metrics') OR json_valid(NEW.payload)=0
 THEN RAISE(ABORT,'Invalid event record') END;
END;
CREATE TRIGGER IF NOT EXISTS dsi_event_revision AFTER INSERT ON delivery_events
BEGIN
 UPDATE dsi_store_metadata SET revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1;
END;
