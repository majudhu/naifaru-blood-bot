PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_donations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`donor_id` integer NOT NULL,
	`blood_type` text DEFAULT '' NOT NULL,
	`donated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`donor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_donations`(`id`, `donor_id`, `donated_at`, `created_at`)
SELECT `id`, `donor_id`, `donated_at`, `created_at`
FROM `donations`;--> statement-breakpoint
DROP TABLE `donations`;--> statement-breakpoint
ALTER TABLE `__new_donations` RENAME TO `donations`;--> statement-breakpoint
CREATE INDEX `donations_donor_id_idx` ON `donations` (`donor_id`);--> statement-breakpoint
CREATE INDEX `donations_blood_type_idx` ON `donations` (`blood_type`);--> statement-breakpoint
CREATE INDEX `donations_donated_at_idx` ON `donations` (`donated_at`);--> statement-breakpoint
PRAGMA defer_foreign_keys = off;