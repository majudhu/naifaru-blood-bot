DROP INDEX `users_is_available_idx`;--> statement-breakpoint
ALTER TABLE `users` ADD `status` text DEFAULT 'Non-Donor' NOT NULL;--> statement-breakpoint
UPDATE `users` SET `status` = CASE WHEN `is_available` = 1 THEN 'Donor' ELSE 'Non-Donor' END;--> statement-breakpoint
CREATE INDEX `users_status_idx` ON `users` (`status`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `is_available`;