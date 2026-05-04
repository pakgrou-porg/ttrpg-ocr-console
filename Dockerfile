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

# Install all dependencies (including devDependencies needed for the build
# and for drizzle-kit which is used at container startup for migrations).
RUN pnpm install --no-frozen-lockfile

# Copy the rest of the source
COPY . .

# Build the Vite frontend + bundle the Express server.
# DATABASE_URL is required by drizzle.config.ts at build time for schema
# introspection. We pass a dummy value here; the real value is injected
# at container runtime via environment variables.
ARG DATABASE_URL=mysql://build:build@localhost:3306/build
ENV DATABASE_URL=${DATABASE_URL}
RUN pnpm build

# ─── Stage 2: Production image ───────────────────────────────────────────────
FROM node:22-alpine AS runner

# Install the same pinned pnpm version for running db:push at startup
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# Copy dependency manifests and patches (required by pnpm for patched deps)
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install production dependencies only
RUN pnpm install --no-frozen-lockfile --prod

# Copy drizzle-kit and its dependencies from the builder stage.
# drizzle-kit is a devDependency so --prod does not install it, but it is
# needed to run pnpm db:push at container startup.
# Dependencies: @drizzle-team/brocli, @esbuild-kit/esm-loader, esbuild, tsx
COPY --from=builder /app/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=builder /app/node_modules/.bin/drizzle-kit ./node_modules/.bin/drizzle-kit
COPY --from=builder /app/node_modules/@drizzle-team ./node_modules/@drizzle-team
COPY --from=builder /app/node_modules/@esbuild-kit ./node_modules/@esbuild-kit
COPY --from=builder /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=builder /app/node_modules/.bin/esbuild ./node_modules/.bin/esbuild
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder /app/node_modules/.bin/tsx ./node_modules/.bin/tsx

# Copy the built artefacts from the builder stage.
# Vite outputs to dist/public/ (see vite.config.ts outDir).
# The Express server outputs to dist/index.js.
# Both live under dist/ — a single COPY covers everything.
COPY --from=builder /app/dist ./dist

# Copy the drizzle schema and migrations for use by drizzle-kit at startup
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Copy TypeScript config (drizzle.config.ts needs it to resolve paths)
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Expose the application port (default 3000; overridable via PORT env var)
EXPOSE 3000

# Health-check: ping the /api/trpc/health endpoint every 30 s
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/trpc/health || exit 1

# Run database migrations then start the production server.
# pnpm db:push (drizzle-kit generate + migrate) is idempotent — safe to run on
# every restart. It connects to the DATABASE_URL env var set at runtime.
CMD ["sh", "-c", "pnpm db:push && node dist/index.js"]
