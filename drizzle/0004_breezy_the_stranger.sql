CREATE TABLE `db_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`connectionType` varchar(64) NOT NULL,
	`host` varchar(256) NOT NULL,
	`port` int NOT NULL DEFAULT 5432,
	`databaseName` varchar(128) NOT NULL,
	`encryptedUsername` text,
	`encryptedPassword` text,
	`usernameIv` varchar(64),
	`usernameAuthTag` varchar(64),
	`passwordIv` varchar(64),
	`passwordAuthTag` varchar(64),
	`useSsl` boolean NOT NULL DEFAULT true,
	`isActive` boolean NOT NULL DEFAULT false,
	`lastTestStatus` enum('untested','success','failed') NOT NULL DEFAULT 'untested',
	`lastTestedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `db_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `db_connections_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `llm_providers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`providerType` varchar(64) NOT NULL,
	`baseUrl` varchar(512) NOT NULL,
	`encryptedApiKey` text,
	`keyIv` varchar(64),
	`keyAuthTag` varchar(64),
	`isActive` boolean NOT NULL DEFAULT true,
	`notes` text,
	`availableModels` json DEFAULT ('[]'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llm_providers_id` PRIMARY KEY(`id`),
	CONSTRAINT `llm_providers_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `model_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`providerId` int NOT NULL,
	`modelName` varchar(256) NOT NULL,
	`pipelineStage` varchar(64) NOT NULL,
	`priority` int NOT NULL DEFAULT 1,
	`isActive` boolean NOT NULL DEFAULT true,
	`configOverrides` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `model_assignments_id` PRIMARY KEY(`id`)
);
