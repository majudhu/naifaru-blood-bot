CREATE TABLE `bot_sessions` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_processed_updates` (
	`update_id` integer PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `blood_requests` ADD `telegram_chat_id` integer;--> statement-breakpoint
ALTER TABLE `blood_requests` ADD `telegram_message_id` integer;--> statement-breakpoint
CREATE INDEX `blood_requests_telegram_message_idx` ON `blood_requests` (`telegram_chat_id`,`telegram_message_id`);