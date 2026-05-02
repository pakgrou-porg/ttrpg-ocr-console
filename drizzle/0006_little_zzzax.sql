ALTER TABLE `documents` ADD `ownerUserId` int;--> statement-breakpoint
ALTER TABLE `documents` ADD `createdByUserId` int;--> statement-breakpoint
ALTER TABLE `documents` ADD `visibility` enum('private','shared','global') DEFAULT 'private' NOT NULL;