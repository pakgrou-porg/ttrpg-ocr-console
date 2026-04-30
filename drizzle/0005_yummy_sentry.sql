CREATE TABLE `document_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`pageNumber` int NOT NULL,
	`imageUrl` varchar(1024),
	`thumbnailUrl` varchar(1024),
	`phash` varchar(64),
	`isBinarized` boolean NOT NULL DEFAULT false,
	`imageWidth` int,
	`imageHeight` int,
	`isFlagged` boolean NOT NULL DEFAULT false,
	`ocrCompleted` boolean NOT NULL DEFAULT false,
	`ocrConfidence` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `document_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(512) NOT NULL,
	`gameSystem` varchar(128),
	`edition` varchar(64),
	`title` varchar(512),
	`publisher` varchar(256),
	`totalPages` int NOT NULL DEFAULT 0,
	`processedPages` int NOT NULL DEFAULT 0,
	`flaggedPages` int NOT NULL DEFAULT 0,
	`avgConfidence` int DEFAULT 0,
	`status` enum('pending','converting','ocr_pass1','ocr_pass2','enriching','review','completed','failed') NOT NULL DEFAULT 'pending',
	`pdfUrl` varchar(1024),
	`coverThumbnailUrl` varchar(1024),
	`ingestionJobId` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hitl_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pageId` int NOT NULL,
	`ocrResultId` int,
	`reason` text NOT NULL,
	`flagCategory` varchar(64),
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('queued','in_progress','resolved','skipped','escalated') NOT NULL DEFAULT 'queued',
	`assignedTo` int,
	`resolutionNotes` text,
	`resolvedBy` int,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hitl_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ocr_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pageId` int NOT NULL,
	`rawText` text,
	`structuredData` json,
	`layoutMetadata` json,
	`confidence` int DEFAULT 0,
	`status` enum('pending','pass1_complete','pass2_complete','validated','corrected','failed') NOT NULL DEFAULT 'pending',
	`pass1Model` varchar(256),
	`pass2Model` varchar(256),
	`auditLog` json DEFAULT ('[]'),
	`correctedText` text,
	`correctedStructuredData` json,
	`correctedBy` int,
	`correctedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ocr_results_id` PRIMARY KEY(`id`)
);
