-- Content blocks assembled from multiple pages' OCR output.
-- Each block represents a semantically complete unit of content:
-- a full paragraph (even if it spans two physical pages), a complete
-- table, a heading, etc.  Running headers, footers, and page numbers
-- are excluded during assembly.
CREATE TABLE "document_content_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	-- Semantic type matching OCR content_block types (heading/paragraph/table/rule_term/etc.)
	"block_type" varchar(32) NOT NULL,
	-- Fully assembled text content (null for illustration/map blocks)
	"content" text,
	-- For table blocks: serialised JSON { caption, headers[], rows[][] }
	"table_data" jsonb,
	-- Physical page span (start = page where this block first appears)
	"start_page_id" integer,
	"end_page_id" integer,
	"start_page_number" integer NOT NULL,
	"end_page_number" integer NOT NULL,
	-- Array of { pageId, pageNumber, blockIdx } pointing back to source content_blocks
	"source_regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	-- True when this block was merged from 2+ pages
	"is_cross_page" boolean DEFAULT false NOT NULL,
	-- Review status: assembled | reviewed | flagged
	"status" varchar(16) DEFAULT 'assembled' NOT NULL,
	-- Heading level, list type, rule term name, etc.
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dcb_document_sequence_idx" ON "document_content_blocks" ("document_id","sequence");
--> statement-breakpoint
CREATE INDEX "dcb_document_block_type_idx" ON "document_content_blocks" ("document_id","block_type");
