ALTER TABLE `llm_providers` ADD `keyPrefix` varchar(8);--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `keySuffix` varchar(8);--> statement-breakpoint
ALTER TABLE `llm_providers` ADD `keyLength` int;