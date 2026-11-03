# syntax=docker/dockerfile:1

# AI Radar - image for a future Synology / NAS deployment.
# Secrets and the SQLite database are NOT baked into the image.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Pages are dynamic; no database is required during the build.
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV AI_RADAR_DB_PATH=/data/ai-radar.db

RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app \
    && mkdir -p /data && chown -R app:app /data

COPY package.json package-lock.json next.config.ts ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=builder --chown=app:app /app/.next ./.next
COPY --from=builder --chown=app:app /app/public ./public

USER app
EXPOSE 3000

# Bind to all interfaces inside the container so the NAS can reach it.
# Before exposing it beyond your LAN, read the access-control note in README.
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
