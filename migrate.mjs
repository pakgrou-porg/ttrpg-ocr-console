/**
 * migrate.mjs — Standalone database migration runner
 *
 * Uses drizzle-orm/mysql2 migrator to apply SQL migration files from the
 * drizzle/ directory. This script is intentionally dependency-free beyond
 * drizzle-orm and mysql2, both of which are production dependencies already
 * present in the --prod install.
 *
 * Why this exists:
 *   drizzle-kit (the CLI that powers `pnpm db:push`) is a devDependency.
 *   Copying it into the production Docker image is fragile because pnpm uses
 *   a virtual store (.pnpm/) and the exact paths change with each version bump.
 *   This script replaces the drizzle-kit dependency at runtime entirely.
 *
 * Usage:
 *   node migrate.mjs
 *
 * Environment:
 *   DATABASE_URL  — MySQL connection string (required)
 *
 * The script exits with code 0 on success and code 1 on failure so that the
 * Docker CMD can chain it: `node migrate.mjs && node dist/index.js`
 */

import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { createConnection } from "mysql2/promise";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[migrate] ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

// Resolve the migrations folder relative to this script.
// In the Docker image, migrate.mjs lives at /app/migrate.mjs and the
// migration SQL files live at /app/drizzle/*.sql.
const migrationsFolder = join(__dirname, "drizzle");

console.log("[migrate] Starting database migrations...");
console.log(`[migrate] Migrations folder: ${migrationsFolder}`);

let connection;
try {
  // Create a dedicated connection for migrations (not a pool).
  // multipleStatements is required because each migration file may contain
  // multiple SQL statements separated by semicolons.
  connection = await createConnection({
    uri: DATABASE_URL,
    multipleStatements: true,
  });

  const db = drizzle(connection);

  await migrate(db, { migrationsFolder });

  console.log("[migrate] All migrations applied successfully.");
} catch (err) {
  console.error("[migrate] Migration failed:", err.message ?? err);
  process.exit(1);
} finally {
  if (connection) {
    await connection.end();
  }
}
