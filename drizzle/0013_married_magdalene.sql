ALTER TABLE `stage_inscriptions` RENAME COLUMN `systemPrompt` TO `promptName`;--> statement-breakpoint
ALTER TABLE `stage_inscriptions` MODIFY COLUMN `promptName` varchar(128);