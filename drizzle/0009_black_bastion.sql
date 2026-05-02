CREATE TABLE `page_processing_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pageId` int NOT NULL,
	`ocrResultId` int NOT NULL,
	`passNumber` int NOT NULL,
	`modelUsed` varchar(256) NOT NULL,
	`providerName` varchar(128),
	`isCloudPass` boolean NOT NULL DEFAULT false,
	`rawTextOutput` text,
	`structuredOutput` json,
	`score` int,
	`comparisonNotes` text,
	`wasAccepted` boolean NOT NULL DEFAULT false,
	`processingTimeMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `page_processing_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `status` enum('pending','phase1_non_ocr','phase2_ocr','phase3_storage','hitl_required','completed','failed') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `ingestion_jobs` MODIFY COLUMN `status` enum('queued','phase1_non_ocr','phase2_ocr','phase3_storage','hitl_required','completed','failed') NOT NULL DEFAULT 'queued';--> statement-breakpoint
ALTER TABLE `ocr_results` MODIFY COLUMN `status` enum('pending','pass1_complete','pass2_complete','pass3_complete','pass4_complete','validated','corrected','hitl_required','failed') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `document_pages` ADD `rawPngUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `document_pages` ADD `preprocessedPngUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `document_pages` ADD `wasPreprocessed` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `document_pages` ADD `preprocessingApplied` varchar(128);--> statement-breakpoint
ALTER TABLE `document_pages` ADD `layoutType` varchar(64);--> statement-breakpoint
ALTER TABLE `document_pages` ADD `contentRegions` json;--> statement-breakpoint
ALTER TABLE `document_pages` ADD `continuityFlags` json;--> statement-breakpoint
ALTER TABLE `document_pages` ADD `pageJsonOutput` json;--> statement-breakpoint
ALTER TABLE `document_pages` ADD `phaseStatus` varchar(64);--> statement-breakpoint
ALTER TABLE `documents` ADD `scannedName` varchar(512);--> statement-breakpoint
ALTER TABLE `documents` ADD `documentSummary` text;--> statement-breakpoint
ALTER TABLE `documents` ADD `documentType` varchar(64);--> statement-breakpoint
ALTER TABLE `ingestion_jobs` ADD `currentPhase` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `ingestion_jobs` ADD `currentStage` varchar(64);--> statement-breakpoint
ALTER TABLE `model_assignments` ADD `systemPrompt` text;--> statement-breakpoint
ALTER TABLE `model_assignments` ADD `temperature` float DEFAULT 0.2;--> statement-breakpoint
ALTER TABLE `model_assignments` ADD `llmSettings` json;--> statement-breakpoint
ALTER TABLE `ocr_results` ADD `pass3Model` varchar(256);--> statement-breakpoint
ALTER TABLE `ocr_results` ADD `pass4Model` varchar(256);--> statement-breakpoint
ALTER TABLE `ocr_results` ADD `qualityScore` int;--> statement-breakpoint
ALTER TABLE `ocr_results` ADD `qualityNotes` text;--> statement-breakpoint
CREATE INDEX `page_attempts_pageId_idx` ON `page_processing_attempts` (`pageId`);--> statement-breakpoint
CREATE INDEX `page_attempts_ocrResultId_idx` ON `page_processing_attempts` (`ocrResultId`);--> statement-breakpoint
CREATE INDEX `model_assignments_providerId_idx` ON `model_assignments` (`providerId`);--> statement-breakpoint
CREATE INDEX `model_assignments_stage_idx` ON `model_assignments` (`pipelineStage`);--> statement-breakpoint
ALTER TABLE `document_pages` DROP COLUMN `imageUrl`;--> statement-breakpoint
ALTER TABLE `document_pages` DROP COLUMN `isBinarized`;--> statement-breakpoint
ALTER TABLE `model_assignments` DROP COLUMN `configOverrides`;