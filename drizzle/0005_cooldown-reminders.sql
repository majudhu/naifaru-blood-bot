CREATE TABLE `cooldown_reminders` (
	`user_id` integer NOT NULL,
	`donated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `donated_at`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Start reminders with upcoming cooldowns rather than messaging already eligible donors.
INSERT INTO cooldown_reminders (user_id, donated_at)
SELECT id, last_donated_at FROM users
WHERE last_donated_at <= unixepoch('now', '-90 days');
