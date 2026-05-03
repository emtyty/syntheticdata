# syntax=docker/dockerfile:1.7

# ─── Stage 1: build ──────────────────────────────────────────────────────────
# Compiles backend (tsc) and frontend (vite build). Uses build tools that the
# runtime image doesn't need (python, make, g++ for native better-sqlite3).

FROM node:20-bookworm-slim AS build

ENV NODE_ENV=development
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install workspaces with full dev deps so both packages can build.
COPY package.json package-lock.json* ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspaces --include-workspace-root

COPY packages/backend ./packages/backend
COPY packages/frontend ./packages/frontend

RUN npm run build

# ─── Stage 2: production deps only ───────────────────────────────────────────
# Re-install with --omit=dev so the runtime image stays small. Native
# better-sqlite3 is rebuilt against the same Node version we run.

FROM node:20-bookworm-slim AS prod-deps

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace packages/backend --include-workspace-root --omit=dev

# ─── Stage 3: runtime ────────────────────────────────────────────────────────

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    FRONTEND_DIST=/app/frontend/dist \
    DB_PATH=/app/data/synthetic.db

WORKDIR /app

# Non-root user for the runtime process. Owns /app/data so the SQLite volume
# is writable.
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs --create-home --shell /usr/sbin/nologin synthetic \
 && mkdir -p /app/data \
 && chown -R synthetic:nodejs /app

COPY --from=prod-deps --chown=synthetic:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=synthetic:nodejs /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=build     --chown=synthetic:nodejs /app/packages/backend/dist ./packages/backend/dist
COPY --from=build     --chown=synthetic:nodejs /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=build     --chown=synthetic:nodejs /app/packages/frontend/dist ./frontend/dist
COPY --chown=synthetic:nodejs package.json ./

USER synthetic

EXPOSE 3001
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/backend/dist/server.js"]
