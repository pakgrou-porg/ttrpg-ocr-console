/**
 * migrate.mjs — Standalone database migration runner (Postgres / Supabase)
 *
 * Uses drizzle-orm/postgres-js migrator to apply SQL migration files from the
 * drizzle/ directory. Intentionally dependency-free beyond drizzle-orm and
 * postgres (postgres-js), both of which are production dependencies.
 *
 * Usage:
 *   node migrate.mjs
 *
 * Environment:
 *   DATABASE_URL — PostgreSQL connection string (required)
 *                  Format: postgresql://user:password@host:port/database
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[migrate] ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const migrationsFolder = join(__dirname, "drizzle");

console.log("[migrate] Starting database migrations...");
console.log(`[migrate] Migrations folder: ${migrationsFolder}`);

// Use max:1 for a dedicated single-connection migration client
const client = postgres(DATABASE_URL, { max: 1 });

try {
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  console.log("[migrate] All migrations applied successfully.");
} catch (err) {
  console.error("[migrate] Migration failed:", err.message ?? err);
  process.exit(1);
} finally {
  await client.end();
}
