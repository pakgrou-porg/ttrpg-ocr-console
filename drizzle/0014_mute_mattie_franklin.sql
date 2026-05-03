CREATE TABLE `prompt_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`promptName` varchar(128) NOT NULL,
	`promptText` text NOT NULL,
	`version` int NOT NULL,
	`savedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prompt_versions_id` PRIMARY KEY(`id`)
);
