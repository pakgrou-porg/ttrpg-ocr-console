CREATE TABLE `ingestion_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceFile` varchar(512) NOT NULL,
	`gameSystem` varchar(128),
	`status` enum('queued','converting','pass1_ocr','pass2_ocr','enriching','review','completed','failed') NOT NULL DEFAULT 'queued',
	`totalPages` int NOT NULL DEFAULT 0,
	`processedPages` int NOT NULL DEFAULT 0,
	`flaggedPages` int NOT NULL DEFAULT 0,
	`avgConfidence` int DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ingestion_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` text NOT NULL,
	`category` varchar(64) NOT NULL,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_config_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `telemetry_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`source` varchar(128) NOT NULL,
	`metricValue` int,
	`costMicros` int DEFAULT 0,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `telemetry_events_id` PRIMARY KEY(`id`)
);
