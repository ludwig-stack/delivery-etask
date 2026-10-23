import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// Every change is a new event. Original plans and previous records are retained.
export const deliveryEvents = sqliteTable("delivery_events", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  version: integer("version").notNull(),
  payload: text("payload").notNull(),
  actorId: text("actor_id").notNull(),
  actorName: text("actor_name").notNull(),
  at: text("at").notNull(),
}, (t) => [
  uniqueIndex("delivery_entity_version").on(t.entityType, t.entityId, t.version),
  index("delivery_events_at").on(t.at),
]);
