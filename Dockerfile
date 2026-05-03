# ─── Stage 1: Build ──────────────────────────────────────────────────────────
# Uses the official Node 22 Alpine image as the build base.
# Alpine keeps the final image small (~200 MB vs ~900 MB for Debian).
FROM node:22-alpine AS builder

# Install pnpm globally
RUN npm install -g pnpm@10

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies needed for the build)
RUN pnpm install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Build the Vite frontend + bundle the Express server
# DATABASE_URL is required by drizzle.config.ts at build time only for
# schema generation (pnpm db:push). The actual runtime value is injected
# via environment variables at container start.
RUN pnpm build

# ─── Stage 2: Production image ───────────────────────────────────────────────
FROM node:22-alpine AS runner

# Install pnpm (needed to install production-only deps)
RUN npm install -g pnpm@10

WORKDIR /app

# Copy dependency manifests
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

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
