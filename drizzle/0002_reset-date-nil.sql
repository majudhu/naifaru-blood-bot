-- DATE_NIL (0000-01-01T00:00:00Z) stored as Unix seconds.
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
UPDATE `users` SET `dob` = -62167219200 WHERE `dob` = 0;--> statement-breakpoint
UPDATE `users` SET `last_donated_at` = -62167219200 WHERE `last_donated_at` = 0;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telegram_user_id` integer,
	`telegram_username` text,
	`name` text NOT NULL,
	`phone` text,
	`blood_type` text DEFAULT '' NOT NULL,
	`nid` text,
	`sex` text NOT NULL,
	`dob` integer DEFAULT -62167219200 NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`island` text DEFAULT '' NOT NULL,
	`is_available` integer DEFAULT false NOT NULL,
	`last_donated_at` integer DEFAULT -62167219200 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
INSERT INTO `__new_users`(
	`id`,
	`telegram_user_id`,
	`telegram_username`,
	`name`,
	`phone`,
	`blood_type`,
	`nid`,
	`sex`,
	`dob`,
	`address`,
	`island`,
	`is_available`,
	`last_donated_at`,
	`notes`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`telegram_user_id`,
	`telegram_username`,
	`name`,
	`phone`,
	`blood_type`,
	`nid`,
	`sex`,
	`dob`,
	`address`,
	`island`,
	`is_available`,
	`last_donated_at`,
	`notes`,
	`created_at`,
	`updated_at`
FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_telegram_user_id_unique` ON `users` (`telegram_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_telegram_username_unique` ON `users` (`telegram_username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_nid_unique` ON `users` (`nid`);--> statement-breakpoint
CREATE INDEX `users_blood_type_idx` ON `users` (`blood_type`);--> statement-breakpoint
CREATE INDEX `users_is_available_idx` ON `users` (`is_available`);--> statement-breakpoint
CREATE INDEX `users_last_donated_at_idx` ON `users` (`last_donated_at`);--> statement-breakpoint
PRAGMA defer_foreign_keys = off;
