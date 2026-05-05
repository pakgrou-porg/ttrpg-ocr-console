# ─── Stage 1: Build ──────────────────────────────────────────────────────────
# Uses the official Node 22 Alpine image as the build base.
# Alpine keeps the final image small (~200 MB vs ~900 MB for Debian).
FROM node:22-alpine AS builder

# Install the exact pnpm version declared in package.json (packageManager:
# pnpm@10.4.1) via npm. This is more reliable than corepack in multi-platform
# CI builds (QEMU emulation can cause corepack to resolve a different version).
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# Copy dependency manifests AND patches directory first for layer caching.
# The patches/ directory contains pnpm patch files (e.g. wouter@3.7.1.patch)
# referenced in pnpm-lock.yaml. pnpm install fails with ENOENT if they are absent.
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install all dependencies (including devDependencies needed for the build).
RUN pnpm install --no-frozen-lockfile

# Copy the rest of the source
COPY . .

# Build the Vite frontend + bundle the Express server.
# DATABASE_URL is required by drizzle.config.ts at build time for schema
# introspection. We pass a dummy value here; the real value is injected
# at container runtime via environment variables.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/postgres
ENV DATABASE_URL=${DATABASE_URL}

# Vite statically replaces import.meta.env.VITE_* at build time.
# Pass these as build args so they are baked into the frontend bundle.
ARG VITE_APP_ID=""
ARG VITE_OAUTH_PORTAL_URL="https://manus.im"
ARG VITE_ANALYTICS_ENDPOINT=""
ARG VITE_ANALYTICS_WEBSITE_ID=""
ENV VITE_APP_ID=${VITE_APP_ID}
ENV VITE_OAUTH_PORTAL_URL=${VITE_OAUTH_PORTAL_URL}
ENV VITE_ANALYTICS_ENDPOINT=${VITE_ANALYTICS_ENDPOINT}
ENV VITE_ANALYTICS_WEBSITE_ID=${VITE_ANALYTICS_WEBSITE_ID}

RUN pnpm build

# ─── Stage 2: Production image ───────────────────────────────────────────────
FROM node:22-alpine AS runner

# Install the same pinned pnpm version
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# Copy dependency manifests and patches (required by pnpm for patched deps)
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install production dependencies only.
# drizzle-kit is intentionally excluded — migrations are handled by migrate.mjs
# which uses drizzle-orm (a production dependency) directly.
RUN pnpm install --no-frozen-lockfile --prod

# Copy the built artefacts from the builder stage.
# Vite outputs to dist/public/ (see vite.config.ts outDir).
# The Express server outputs to dist/index.js.
# Both live under dist/ — a single COPY covers everything.
COPY --from=builder /app/dist ./dist

# Copy the drizzle migration SQL files.
# migrate.mjs reads these at startup to apply any pending migrations.
COPY --from=builder /app/drizzle ./drizzle

# Copy the standalone migration runner.
# This script uses drizzle-orm/mysql2 migrator (a prod dependency) to apply
# SQL migration files from the drizzle/ directory. It replaces `pnpm db:push`
# (which requires drizzle-kit, a devDependency) entirely.
COPY migrate.mjs ./migrate.mjs

# Expose the application port (default 3000; overridable via PORT env var)
EXPOSE 3000

# Health-check: ping the /api/trpc/health endpoint every 30 s
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/trpc/health || exit 1

# Run database migrations then start the production server.
# migrate.mjs is idempotent — it only applies migrations whose hashes are not
# yet recorded in the __drizzle_migrations table. Safe to run on every restart.
CMD ["sh", "-c", "node migrate.mjs && node dist/index.js"]
