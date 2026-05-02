ALTER TABLE `llm_providers` ADD `apiPrefix` varchar(64) DEFAULT '/v1';--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `supportsChat` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `supportsVision` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `supportsEmbedding` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `supportsReasoning` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `llm_providers` DROP COLUMN `capabilities`;