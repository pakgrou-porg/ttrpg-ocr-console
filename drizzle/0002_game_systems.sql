CREATE TABLE IF NOT EXISTS "game_systems" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(128) NOT NULL,
  "abbreviation" varchar(32),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TRIGGER update_game_systems_updated_at
  BEFORE UPDATE ON "game_systems"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO "game_systems" ("name", "abbreviation", "sort_order") VALUES
  ('Dungeons & Dragons 5e', 'D&D 5e', 0),
  ('Pathfinder 2e', 'PF2e', 1),
  ('Call of Cthulhu 7e', 'CoC 7e', 2),
  ('Custom / Other', NULL, 99)
ON CONFLICT DO NOTHING;
