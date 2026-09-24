# AH Legal OS — production image (one image; three roles):
#   web     : node server.js                     (default CMD)
#   worker  : node dist/worker.cjs                (reminders, deliveries, scans, OCR, integrity)
#   backup  : node dist/backup.cjs all            (nightly: encrypted mysqldump + restore test)
#   migrate : `docker build --target migrate` → prisma migrate deploy (one-off job per release)
#
# Minimal runtime: Next.js standalone output + bundled tools, no dev dependencies, non-root user.

ARG NODE_IMAGE=node:24-bookworm-slim

# ── deps: exact, locked install ──────────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ── build ────────────────────────────────────────────────────────────────────
FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npx prisma generate \
 && npm run build \
 && npm run build:tools

# ── migrate: one-off job, same lock file, runs `prisma migrate deploy` ─────
FROM deps AS migrate
COPY prisma ./prisma
COPY prisma.config.ts ./
CMD ["npx", "prisma", "migrate", "deploy"]

# ── runtime ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
# MySQL/MariaDB client tools (mysqldump / mysql) for the backup job; tar for document archives.
RUN apt-get update \
 && apt-get install -y --no-install-recommends default-mysql-client openssl ca-certificates tar \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --home /app app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3100 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/dist ./dist
# Prisma engine for the bundled tools (the standalone trace already contains @prisma/client).
COPY --from=build --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p /app/backups /app/storage && chown app:app /app/backups /app/storage
USER app
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD node -e "fetch('http://127.0.0.1:3100/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
