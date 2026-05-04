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

# ── drizzle-kit migration support ────────────────────────────────────────────
# drizzle-kit is a devDependency so pnpm --prod does not install it, but it is
# needed to run `pnpm db:push` at container startup.
#
# pnpm uses a VIRTUAL STORE (.pnpm/) — packages are NOT hoisted to top-level
# node_modules/. @esbuild-kit and @drizzle-team only exist inside the .pnpm
# virtual store, not at node_modules/@esbuild-kit. We must copy the .pnpm
# virtual store entries directly.
#
# Required .pnpm entries (drizzle-kit + its 4 deps):
#   drizzle-kit@0.31.10
#   @drizzle-team+brocli@0.10.2
#   @esbuild-kit+esm-loader@2.6.5
#   @esbuild-kit+core-utils@3.3.2   (dep of esm-loader)
#   esbuild@0.25.10                  (the version drizzle-kit resolves)
#   tsx@4.21.0                       (the version drizzle-kit resolves)
#
# We also copy the top-level symlinks (node_modules/drizzle-kit, .bin/drizzle-kit)
# that pnpm creates when hoisting.
COPY --from=builder /app/node_modules/.pnpm/drizzle-kit@0.31.10 ./node_modules/.pnpm/drizzle-kit@0.31.10
COPY --from=builder /app/node_modules/.pnpm/@drizzle-team+brocli@0.10.2 ./node_modules/.pnpm/@drizzle-team+brocli@0.10.2
COPY --from=builder /app/node_modules/.pnpm/@esbuild-kit+esm-loader@2.6.5 ./node_modules/.pnpm/@esbuild-kit+esm-loader@2.6.5
COPY --from=builder /app/node_modules/.pnpm/@esbuild-kit+core-utils@3.3.2 ./node_modules/.pnpm/@esbuild-kit+core-utils@3.3.2
COPY --from=builder /app/node_modules/.pnpm/esbuild@0.25.10 ./node_modules/.pnpm/esbuild@0.25.10
COPY --from=builder /app/node_modules/.pnpm/tsx@4.21.0 ./node_modules/.pnpm/tsx@4.21.0

# Copy the top-level hoisted symlink for drizzle-kit (pnpm hoists it because
# it is listed in devDependencies; the symlink points into .pnpm/).
# We recreate it as a real directory copy since COPY does not follow symlinks
# across stages — we copy the resolved target instead.
COPY --from=builder /app/node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=builder /app/node_modules/.bin/drizzle-kit ./node_modules/.bin/drizzle-kit

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
