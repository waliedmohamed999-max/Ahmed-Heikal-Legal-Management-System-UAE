# AH Legal OS

Legal practice management and case intelligence platform for the office of Counsellor Ahmed Heikal (UAE).
Bilingual (Arabic RTL / English LTR), multi-tenant-ready, built as one connected core:

**Client → Case → Hearing → Deadline → Task → Document → Invoice → Activity → Notification → Audit**

The same deployment serves three surfaces: the public website (`/`), the internal app (`/app`) and the
client portal (`/portal`). They can also be split across hostnames via `PUBLIC_HOST`, `APP_HOST` and `PORTAL_HOST`.

> All bundled data is **synthetic**. Never load real client data into development or test environments.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Radix UI, TanStack Query,
Prisma 6 + **MySQL 8.4** (the database of record; MariaDB 10.4+ also works for local XAMPP development),
Redis (shared rate limits), S3-compatible object storage, ClamAV, SMTP, Argon2id, Anthropic SDK (optional),
Vitest and Playwright.

## Run locally

Requirements: Node 22+ (tested on 24) and Docker.

```bash
npm install
cp .env.example .env            # fill the secrets (generation commands are in the file)
docker compose up -d            # MySQL 8.4 :3307, Redis :6380, MinIO :9010, ClamAV :3311, Mailpit :1025/:8025
npm run db:deploy               # prisma migrate deploy (includes integrity triggers + FULLTEXT indexes)
npm run db:seed:demo            # foundation + synthetic demo data  (db:seed = foundation only)
npm run dev                     # http://localhost:3100
```

Using XAMPP instead of Docker for the database: create an empty database (e.g. `ahmedhiekal`),
set `DATABASE_URL=mysql://root@127.0.0.1:3306/ahmedhiekal` in `.env`, then run `npm run db:deploy`
and `npm run db:seed`. **Local development only.** XAMPP ships MariaDB 10.4 (end of life), not MySQL 8.4,
and on Windows it stores table names in lower case (`lower_case_table_names=1`). The app works against it,
but a dump taken from it will not restore correctly onto Linux MySQL. Staging and production use MySQL 8.4
(see `docs/STAGING-SETUP.md`).

In development the background jobs run in-process. In production they run in the worker:

```bash
PORT=3100 npm run build && npm start   # web (listens on $PORT; hosts such as Hostinger set it)
npm run worker                  # reminders, e-mail/SMS/WhatsApp delivery queue, malware scans, OCR, integrity sweep
npm run backup -- all           # nightly: encrypted mysqldump + off-site copy + restore test
```

Production uses the Docker image (`Dockerfile`, non-root, standalone) — see
[docs/PRODUCTION-CHECKLIST.md](docs/PRODUCTION-CHECKLIST.md) and [docs/PRODUCTION-READINESS-REPORT.md](docs/PRODUCTION-READINESS-REPORT.md).
The first real owner is created with `npm run create-owner -- --email … --name "…"` (prints a one-time set-password link).

### Demo accounts (synthetic, dev only)

Password for all: `Demo-Password-2026`. Demo data is opt-in (`npm run db:seed:demo`), refused when
`NODE_ENV=production`, and a production server refuses to start while demo data exists.

| Email | Role | Notes |
|---|---|---|
| ahmed@demo.ahlegal.test | Owner | Sees everything, including admin areas |
| mohamed@demo.ahlegal.test | Senior lawyer | |
| sara@demo.ahlegal.test | Lawyer (assigned scope) | Sees only her cases; blocked from the highly confidential one |
| omar@demo.ahlegal.test | Junior lawyer | |
| layla@demo.ahlegal.test | Legal assistant | |
| reception@demo.ahlegal.test | Office coordinator | |
| finance@demo.ahlegal.test | Finance | |
| client@demo.ahlegal.test | Client portal | Use `/portal/login` |

## Tests

```bash
npm test                  # unit: access rules, deadlines, i18n, VAT, audit, CSV, config, redaction, timezone, service worker
npm run test:integration  # DB-backed core flow + security suites on an isolated MySQL <db>_test database
npm run test:security     # security suites only (MFA, audit immutability, IDOR, portal isolation, malware, backup/restore …)
npm run test:e2e          # Playwright browser tests against :3100 (starts `npm run dev` if needed)
npm run typecheck && npm run lint
```

The integration and security suites use the Docker services (MySQL, ClamAV, MinIO, Mailpit).

## Configuration and honesty rules

- Secrets live only in the environment (`.env` locally, a secret manager in production). The server validates the
  configuration at boot and **refuses to start** with missing, placeholder or reused secrets, demo data, or unsafe
  production settings (see `src/server/config.ts`).
- Integrations show their real status (**Not configured** / **Connected** / **Error**) until credentials are provided.
  E-mail, SMS, WhatsApp Business API (official Cloud API only), OCR, S3 and AI are adapters.
- No government-portal scraping, no storage of government credentials and no bypassing UAE PASS / OTP.
  Imported and AI-extracted deadlines stay **Needs verification** until a lawyer confirms them (enforced by a DB trigger).
- AI never sends, submits, approves, deletes or changes legal status. Its output is a proposal with citations for a person to review.
- Nothing here is a certification of legal or regulatory compliance. Production deployment should undergo
  independent legal, privacy and security review.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture, security model and module map.
