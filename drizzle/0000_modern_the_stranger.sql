CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_uid` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'student' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_uid_unique` ON `users` (`google_uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`category_name` text NOT NULL,
	`category_path` text NOT NULL,
	`title` text NOT NULL,
	`org` text,
	`venue` text,
	`date_time` text,
	`starts_at` integer,
	`ends_at` integer,
	`price` text,
	`background_color` text,
	`background_image_url` text,
	`subtheme` text,
	`is_major` integer DEFAULT false NOT NULL,
	`max_slots` integer DEFAULT 0 NOT NULL,
	`registered_slots` integer DEFAULT 0 NOT NULL,
	`gforms_id` text,
	`gforms_url` text,
	`watch_id` text,
	`watch_expires_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`release_at` integer,
	`registration_opens_at` integer,
	`registration_closes_at` integer,
	`reminder_24h_sent` integer DEFAULT false NOT NULL,
	`reminder_1h_sent` integer DEFAULT false NOT NULL,
	`contentful_entry_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`published_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_events_status_release` ON `events` (`status`,`release_at`);--> statement-breakpoint
CREATE INDEX `idx_events_category` ON `events` (`category_name`);--> statement-breakpoint
CREATE INDEX `idx_events_slug` ON `events` (`slug`);--> statement-breakpoint
CREATE TABLE `site_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `faqs` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`category` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookmarks_user_event` ON `bookmarks` (`user_id`,`event_id`);
