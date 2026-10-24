-- Preserve all event history and extend allowed types for Stage 1.
DROP TRIGGER IF EXISTS dsi_event_version;
CREATE TRIGGER dsi_event_version BEFORE INSERT ON delivery_events
BEGIN
 SELECT CASE WHEN NEW.version != coalesce((SELECT max(version) FROM delivery_events WHERE entity_type=NEW.entity_type AND entity_id=NEW.entity_id),0)+1
 THEN RAISE(ABORT,'DSI_VERSION_CONFLICT') END;
 SELECT CASE WHEN NEW.entity_type NOT IN ('task','milestone','metrics','profile','settings','inbox') OR json_valid(NEW.payload)=0
 THEN RAISE(ABORT,'Invalid event record') END;
END;
