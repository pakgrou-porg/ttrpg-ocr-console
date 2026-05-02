CREATE INDEX `document_pages_documentId_idx` ON `document_pages` (`documentId`);--> statement-breakpoint
CREATE INDEX `document_pages_phash_idx` ON `document_pages` (`phash`);--> statement-breakpoint
CREATE INDEX `document_pages_doc_page_idx` ON `document_pages` (`documentId`,`pageNumber`);--> statement-breakpoint
CREATE INDEX `hitl_queue_pageId_idx` ON `hitl_queue` (`pageId`);--> statement-breakpoint
CREATE INDEX `hitl_queue_status_priority_idx` ON `hitl_queue` (`status`,`priority`,`createdAt`);--> statement-breakpoint
CREATE INDEX `hitl_queue_assignedTo_idx` ON `hitl_queue` (`assignedTo`);--> statement-breakpoint
CREATE INDEX `ocr_results_pageId_idx` ON `ocr_results` (`pageId`);--> statement-breakpoint
CREATE INDEX `ocr_results_status_idx` ON `ocr_results` (`status`);