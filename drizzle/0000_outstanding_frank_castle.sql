CREATE TABLE `blacklist` (
	`phone` text,
	`telegram` text,
	`reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blacklist_phone_unique` ON `blacklist` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `blacklist_telegram_unique` ON `blacklist` (`telegram`);--> statement-breakpoint
CREATE TABLE `blood_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`blood_type` text NOT NULL,
	`location` text,
	`island` text,
	`units_needed` integer DEFAULT 1 NOT NULL,
	`urgent` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `blood_requests_blood_type_idx` ON `blood_requests` (`blood_type`);--> statement-breakpoint
CREATE INDEX `blood_requests_status_idx` ON `blood_requests` (`status`);--> statement-breakpoint
CREATE TABLE `donations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`donor_id` integer NOT NULL,
	`request_id` integer,
	`recorded_by_staff_id` integer,
	`donated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`donor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `blood_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by_staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `donations_donor_id_idx` ON `donations` (`donor_id`);--> statement-breakpoint
CREATE INDEX `donations_request_id_idx` ON `donations` (`request_id`);--> statement-breakpoint
CREATE INDEX `donations_recorded_by_staff_id_idx` ON `donations` (`recorded_by_staff_id`);--> statement-breakpoint
CREATE INDEX `donations_donated_at_idx` ON `donations` (`donated_at`);--> statement-breakpoint
CREATE TABLE `donor_responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`donor_id` integer NOT NULL,
	`status` text DEFAULT 'contacted' NOT NULL,
	`responded_at` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `blood_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`donor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `donor_responses_request_id_donor_id_unique` ON `donor_responses` (`request_id`,`donor_id`);--> statement-breakpoint
CREATE INDEX `donor_responses_request_id_idx` ON `donor_responses` (`request_id`);--> statement-breakpoint
CREATE INDEX `donor_responses_donor_id_idx` ON `donor_responses` (`donor_id`);--> statement-breakpoint
CREATE INDEX `donor_responses_status_idx` ON `donor_responses` (`status`);--> statement-breakpoint
CREATE TABLE `staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`role` text DEFAULT 'nurse' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `staff_username_unique` ON `staff` (`username`);--> statement-breakpoint
CREATE INDEX `staff_role_idx` ON `staff` (`role`);--> statement-breakpoint
CREATE INDEX `staff_is_active_idx` ON `staff` (`is_active`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telegram_user_id` integer,
	`telegram_username` text,
	`name` text NOT NULL,
	`phone` text,
	`blood_type` text NOT NULL,
	`island` text,
	`is_available` integer DEFAULT false NOT NULL,
	`last_donated_at` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_telegram_user_id_unique` ON `users` (`telegram_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE INDEX `users_blood_type_idx` ON `users` (`blood_type`);--> statement-breakpoint
CREATE INDEX `users_is_available_idx` ON `users` (`is_available`);

-- passowrd -> leyrobot 
INSERT INTO `staff` (username, password, role) VALUES ('naifaru', '$scrypt$n=16384,r=8,p=1$hOqlqBpT/N/T1M0Z858bcg$VXWF2uYLHKWmF9MQuRAh7iBf+fNea1wGGnUTIi2DsJKK/5/AyxMspwnL7sSCM/JSbSM7vBRBTW0RrngmPG/9Kw', 'admin');
