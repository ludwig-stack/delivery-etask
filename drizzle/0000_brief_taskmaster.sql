CREATE TABLE `delivery_events` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`version` integer NOT NULL,
	`payload` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_entity_version` ON `delivery_events` (`entity_type`,`entity_id`,`version`);--> statement-breakpoint
CREATE INDEX `delivery_events_at` ON `delivery_events` (`at`);