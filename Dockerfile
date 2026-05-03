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
# --no-frozen-lockfile is used because the lockfile was generated on the host
# and may differ slightly in the Docker build environment.
# Lockfile integrity is validated by the CI test job before this step runs.
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

# Install the same pinned pnpm version for production dependency installation
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# Copy dependency manifests and patches (required by pnpm for patched deps)
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

# Install production dependencies only
RUN pnpm install --no-frozen-lockfile --prod

# Copy the built artefacts from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/drizzle ./drizzle

# The server reads static files from client/dist at runtime.
# The dist/ directory contains the bundled Express server (index.js).

# Expose the application port (default 3000; overridable via PORT env var)
EXPOSE 3000

# Health-check: ping the /api/trpc/health endpoint every 30 s
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/trpc/health || exit 1

# Start the production server
CMD ["node", "dist/index.js"]
