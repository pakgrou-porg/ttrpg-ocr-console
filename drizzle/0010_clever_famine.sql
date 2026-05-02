CREATE TABLE `stage_inscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stage` varchar(64) NOT NULL,
	`primaryProviderId` int,
	`fallbackProviderId` int,
	`systemPrompt` text,
	`temperature` float,
	`maxTokens` int,
	`llmSettings` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stage_inscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `stage_inscriptions_stage_unique` UNIQUE(`stage`)
);
--> statement-breakpoint
DROP TABLE `model_assignments`;--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `displayName` varchar(256) NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `llm_providers` SET `displayName` = `name` WHERE `displayName` = '';--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `port` int;--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `modelId` varchar(256);--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `contextLength` int;--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `maxTokens` int;--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `defaultTemperature` float DEFAULT 0.2;--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `capabilities` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `isDefault` boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `stage_inscriptions_stage_idx` ON `stage_inscriptions` (`stage`);--> statement-breakpoint
CREATE INDEX `stage_inscriptions_primary_idx` ON `stage_inscriptions` (`primaryProviderId`);--> statement-breakpoint
CREATE INDEX `stage_inscriptions_fallback_idx` ON `stage_inscriptions` (`fallbackProviderId`);
