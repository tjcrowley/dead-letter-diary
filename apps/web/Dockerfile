# Build context is the repo root (npm workspace — package-lock.json is at root)

# Stage 1: Install dependencies
FROM node:22-alpine AS deps

WORKDIR /app

# Copy workspace manifests and root lock file
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json

# Install only web workspace dependencies
RUN npm ci --workspace=apps/web --include-workspace-root

# Stage 2: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./apps/web

WORKDIR /app/apps/web

# Use next build without --turbopack (turbopack is dev-only; production uses webpack)
RUN npx next build

# Stage 3: Runner (minimal image with standalone output)
FROM node:22-alpine AS runner

# outputFileTracingRoot=workspace root means standalone lands at apps/web/ inside the bundle
WORKDIR /app/apps/web

ENV NODE_ENV=production

# Copy standalone output (rooted at workspace root due to outputFileTracingRoot)
COPY --from=builder /app/apps/web/.next/standalone /app/
# Copy static assets (not included in standalone by default)
COPY --from=builder /app/apps/web/.next/static ./.next/static
# Copy public assets
COPY --from=builder /app/apps/web/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
