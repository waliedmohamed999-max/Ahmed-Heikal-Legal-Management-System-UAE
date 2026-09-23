# AH Legal OS

Legal practice management and case intelligence platform for the office of Counsellor Ahmed Heikal (UAE).
Bilingual (Arabic RTL / English LTR), multi-tenant-ready, built as one connected core:

**Client → Case → Hearing → Deadline → Task → Document → Invoice → Activity → Notification → Audit**

The same deployment serves three surfaces: the public website (`/`), the internal app (`/app`) and the
client portal (`/portal`). They can also be split across hostnames via `PUBLIC_HOST`, `APP_HOST` and `PORTAL_HOST`.

> All bundled data is **synthetic**. Never load real client data into development or test environments.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Radix UI, TanStack Query,
Prisma 6 + PostgreSQL 16, Redis (rate limiting, optional), Argon2id, Anthropic SDK (optional),
Vitest and Playwright.

## Run locally

Requirements: Node 20+ (tested on 24) and Docker.

```bash
npm install
cp .env.example .env            # then fill the three secrets (commands are in the file)
npm run db:up                   # Postgres :5434, Redis :6380
npm run db:deploy               # apply migrations (includes audit triggers + constraints)
npm run db:seed                 # foundation + synthetic demo data (SEED_DEMO=false for foundation only)
npm run dev                     # http://localhost:3100
```

In development the reminder dispatcher runs in-process. In production run it separately:

```bash
npm run build && npm start      # web
npm run worker                  # reminders, escalations, document text extraction, access expiry
```

### Demo accounts (synthetic, dev only)

Password for all: `Demo-Password-2026`

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

Change or remove these before any non-local deployment (`SEED_DEMO=false`).

## Tests

```bash
npm test                  # unit: access rules, deadline engine, i18n parity, VAT, audit, CSV, templates, court import
npm run test:integration  # DB-backed core flow on an isolated <db>_test database (needs Docker DB)
npm run test:e2e          # Playwright browser tests against :3100 (starts `npm run dev` if needed)
npm run typecheck && npm run lint
```

## Configuration and honesty rules

- Secrets live only in `.env` (git-ignored). Missing secrets fail fast; there are no insecure defaults.
- Integrations show their real status (**Not connected** or **Requires configuration**) until credentials are provided.
  E-mail, SMS, WhatsApp Business API, OCR, S3 and AI are all optional adapters.
- No government-portal scraping, no storage of government credentials and no bypassing UAE PASS / OTP.
  Court data enters through the **Court data import** screen: a person uploads or pastes it, reviews it, and applies it.
  Imported and AI-extracted deadlines stay **Needs verification** until a lawyer confirms them. A database constraint enforces this.
- AI never sends, submits, approves, deletes or changes legal status. Its output is a proposal with citations for a person to review.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture, security model and module map.
