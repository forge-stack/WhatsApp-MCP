# ---- Base image ----
FROM --platform=linux/amd64 node:20-alpine AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- Dependencies ----
FROM base AS deps

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM base AS builder

RUN apk add --no-cache python3 make g++

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure public directory exists
RUN mkdir -p public

RUN npm rebuild better-sqlite3
RUN npm run build

# ---- Production runner ----
FROM base AS runner

ENV NODE_ENV=production

RUN addgroup -g 1001 nodejs \
  && adduser -D -G nodejs -u 1001 nextjs

RUN mkdir -p /app/data /app/data/auth \
  && chown -R nextjs:nodejs /app/data

# Copy build output (public may be empty but will exist)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/status || exit 1

CMD ["npm", "start"]