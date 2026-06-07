# Build context is the repo root
# Stage 1: Install dependencies using the web app's own lock file
FROM node:22-alpine AS deps

WORKDIR /app

COPY apps/web/package.json ./package.json
COPY apps/web/package-lock.json ./package-lock.json

RUN npm ci

# Stage 2: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY apps/web .

# Use next build without --turbopack (turbopack is dev-only; production uses webpack)
RUN npx next build

# Stage 3: Runner (minimal image with standalone output)
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
# Copy static assets (not included in standalone by default)
COPY --from=builder /app/.next/static ./.next/static
# Copy public assets
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
