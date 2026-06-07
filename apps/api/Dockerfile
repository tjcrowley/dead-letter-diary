# Build context is the repo root (npm workspace — package-lock.json is at root)

# Stage 1: Builder
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace manifests and root lock file
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json

# Install only API workspace dependencies
RUN npm ci --workspace=apps/api --include-workspace-root

COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json

RUN cd apps/api && npx tsc

# Stage 2: Runner
FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY apps/api/migrations ./migrations

EXPOSE 3001

CMD ["node", "dist/server.js"]
