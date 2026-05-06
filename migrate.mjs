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

// Use max:1 for a dedicated single-connection migration client.
// SSL is driven by the connection string: add ?sslmode=disable for self-hosted
// Docker deployments (no TLS cert on internal bridge network); omit for
// Supabase Cloud which requires SSL.
const url = new URL(DATABASE_URL);
const sslMode = url.searchParams.get("sslmode");
const sslOption = sslMode === "disable" ? false : sslMode === "require" ? true : undefined;
const clientOptions = { max: 1, ...(sslOption !== undefined && { ssl: sslOption }) };
const client = postgres(DATABASE_URL, clientOptions);

try {
  // Smoke-test connectivity before running the full migrator
  await client`SELECT 1`;
  console.log("[migrate] Database connection verified.");
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  console.log("[migrate] All migrations applied successfully.");
} catch (err) {
  console.error("[migrate] Migration failed:", err.message ?? err);
  if (err.code) console.error("[migrate] Error code:", err.code);
  if (err.stack) console.error("[migrate] Stack:", err.stack);
  process.exit(1);
} finally {
  await client.end();
}
