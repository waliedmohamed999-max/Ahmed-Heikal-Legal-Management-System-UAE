# AH Legal OS — Production Audit (Phase 11, pre-change baseline)

**Date:** 2026-09-24. **Scope:** the whole repository at commit `1f83b90` plus the uncommitted Phase 11A verification fixes.
**Method:** code review of every server module, API route, auth path, schema and migration; `npm audit`; review of configuration files and docs.

> **Database note.** This baseline was taken while the project still ran on PostgreSQL. During Phase 11 the
> project moved to **MySQL 8.4, which is now the only database of record**. Every PostgreSQL-specific mechanism
> named below (triggers, `pg_dump`, advisory locks, trigram / `tsvector` search, PITR via WAL) was re-implemented
> for MySQL — see `docs/PRODUCTION-READINESS-REPORT.md` → *MySQL Migration Verification*.

This document records the state **before** Phase 11 changes. What was changed afterwards, and how it was tested, is in `docs/PRODUCTION-READINESS-REPORT.md`.

---

## 1. Current architecture

| Layer | Implementation |
|---|---|
| Web app | Next.js 16 (App Router, React 19, Server Components + Server Actions), one deployable serving three surfaces: public site `/`, staff app `/app`, client portal `/portal`. Optional host split via `APP_HOST` / `PORTAL_HOST` in `src/proxy.ts`. |
| API | Route handlers under `src/app/api/*` wrapped by `staffRoute()` (session, MFA gate, rate limit, error normalisation). Mutations are mostly Server Actions wrapped by `staffAction()` (session, rate limit, Zod validation, error normalisation). |
| Domain | Service layer `src/server/services/*` — every function receives the request context and performs permission + record-level checks (`assertPermission`, `assertMatter`, `matterScopeWhere`, `documentScopeWhere`, `loadDocumentForUser`). |
| Database | PostgreSQL 16 via Prisma 6. One migration (`20260923163956_init`). Audit log is append-only (DB triggers block UPDATE/DELETE/TRUNCATE) and hash-chained per organisation. |
| Cache / limits | Redis (ioredis) for rate limiting, with in-memory fallback when Redis is unreachable. |
| Files | `StorageDriver` abstraction. **Only the local-disk driver exists**; `STORAGE_DRIVER=s3` is a stub that throws 503. Files are served through a permission-checked route with a user-bound HMAC signature (TTL 300 s). |
| Background work | `npm run worker` — a `setInterval` loop (60 s) that dispatches reminders from the `Reminder` table (durable), expires temporary matter access, and extracts document text. `pg-boss` is a dependency but not used. |
| AI | Anthropic SDK, model from `AI_MODEL`. Disabled unless a key is configured **and** an admin enables AI. Documents are permission-checked per document before being sent. |
| PWA | `public/sw.js` caches only `/_next/static/*` and an offline page. |

## 2. Current security posture (what is already good)

- **Passwords:** Argon2id (OWASP parameters), 12+ chars with letters and digits, timing-equalised unknown-user path.
- **Brute force:** per-IP (30/15 min) and per-account (10/15 min) rate limits, plus account lockout after 8 failures for 15 min, audited.
- **Sessions:** opaque random token, only its SHA-256 stored; HttpOnly, SameSite=Lax, Secure in production; idle 12 h and absolute 7 d expiry; server-side revocation; separate staff and client realms and cookies; sessions revoked on role/status/password change.
- **MFA:** TOTP with the secret AES-256-GCM encrypted at rest.
- **Authorisation:** RBAC + matter scope (ALL / ASSIGNED / FINANCE) + matter membership + per-document DENY/VIEW/EDIT, enforced in services, not only in UI. Restricted matters render a "Request access" screen without disclosing number or title.
- **Field encryption:** Emirates ID and passport numbers AES-256-GCM, masked without `clients.viewSensitive`.
- **Audit:** immutable, hash-chained, redacts `password|secret|token|emiratesid|passport|mfa` keys, records IP, user agent and session id, chain verification available.
- **Uploads:** extension allow-list + magic-byte checks for PDF/Office/PNG/JPEG, random UUID storage keys, write-once (`wx`), SHA-256 checksum per version, path-traversal guard on keys.
- **Output:** API/action errors are normalised to codes; no stack traces returned.
- **CSV:** formula-injection neutralised for `= + - @`, tab and CR prefixes.
- **Deadlines:** AI/imported deadlines are `NEEDS_VERIFICATION`; only a user with `deadlines.verify` on the matter can confirm; changing a verified imported deadline's date re-opens verification.
- **Robots:** `/app`, `/portal`, `/api`, `/login`, `/print` disallowed; root layout `noindex`; public site `noindex` while the organisation is flagged demo.
- **Security headers:** CSP (self-only), HSTS, nosniff, Referrer-Policy, Permissions-Policy, frame-ancestors none.
- **No CORS headers** are emitted, so browsers treat the API as same-origin only.
- **Raw SQL:** only tagged-template `$queryRaw`/`$executeRaw` with bound parameters (3 uses); no string interpolation.
- **Logging:** 7 `console.*` calls, all log `e.message` only, not payloads.

## 3. Production blockers (must be fixed before any production use)

| # | Blocker | Evidence |
|---|---|---|
| B1 | **Demo data seeds by default.** `SEED_DEMO` defaults to **true**; demo password is a known constant printed to stdout; nothing stops a production database from being seeded with demo users. | `prisma/seed.ts:22-23` |
| B2 | **No way to create the first real owner** without the demo seed. | `prisma/seed.ts` — foundation creates roles only |
| B3 | **Env validation is lazy and incomplete.** Secrets are validated on first use, not at boot; no rejection of placeholder/dev secrets; no production-specific rules (HTTPS APP_URL, S3 settings, demo flag). | `src/server/env.ts` |
| B4 | **No production object storage.** S3 driver is a stub; local disk is not encrypted by the app. | `src/server/storage.ts` |
| B5 | **No malware scanning.** Uploaded files (staff and client portal) become downloadable immediately. | `storeUpload`, `portalUpload` |
| B6 | **No backup automation, no off-site copy, no encryption, no restore test.** Only an on-demand `pg_dump` button that writes an unencrypted dump to local disk. | `src/server/services/backup.ts` |
| B7 | **No password reset and no invitation flow.** Admins set passwords directly for users; lost passwords need an admin. | `admin.ts saveUser` |
| B8 | **No MFA recovery codes and no MFA enforcement policy.** A lost authenticator locks the owner out; MFA cannot be required per role. | `auth/login.ts` |
| B9 | **No error boundaries** (`error.tsx`, `global-error.tsx`). A render error shows the framework error page. | `src/app` |
| B10 | **No CI pipeline, no Dockerfile, no health endpoints.** | repo root |

## 4. Critical risks

| # | Risk | Detail |
|---|---|---|
| C0 | **The background worker cannot start.** `npm run worker` crashes immediately (`server-only` throws outside the `react-server` export condition), so in production **no reminder, escalation, access expiry or text extraction would ever run.** Found by actually starting the worker during this audit. | `src/worker/index.ts`, `package.json` |
| C5 | **Global search leaked highly confidential document titles and OCR snippets.** `globalSearch` used its own looser `documentScopeWhere`, which lacked the rule that HIGHLY_CONFIDENTIAL documents require explicit case membership. A lawyer with view access to a case (but not a member) could see such a document's title and text snippet in ⌘K search, although opening it was correctly refused. Found during this audit's search review. | `search.ts documentScopeWhere` |
| C6 | **Concurrent case creation deadlocked on MySQL.** The number counter used `INSERT … ON DUPLICATE KEY UPDATE`, which deadlocks under concurrency on InnoDB (error 1213); two lawyers opening cases at the same moment could get a failure. Found by the Phase 11 concurrency test. | `matters.ts nextCounter` |
| C7 | **Payment race (lost update / overpayment).** `recordPayment` read the invoice balance outside the transaction and wrote `amountPaid` from that stale value: two simultaneous payments could both pass the overpayment check and one would be lost from the invoice balance. No protection against a double-submitted payment form. | `finance.ts recordPayment` |
| C1 | Email/SMS/WhatsApp adapters **throw "not implemented"** even when configured. | `channels.ts` — reminders by e-mail would silently fail as `FAILED` deliveries. |
| C2 | Reminder delivery is **at-most-once**: the row is marked `SENT` before sending; a crash or provider error after the claim loses the reminder (marked `FAILED`, never retried). No attempts counter. | `reminders.ts dispatchDueReminders` |
| C3 | **TOTP codes can be replayed** within their validity window; MFA verification does not rotate the session token. | `verifyMfa` |
| C4 | Re-running MFA enrolment sets `mfaEnabled=false` **before** the new code is confirmed, silently disabling MFA for an account. | `beginMfaEnrolment` |

## 5. High risks

| # | Risk |
|---|---|
| H1 | CSP uses `'unsafe-inline'` for scripts in production (no nonce). |
| H2 | No explicit Origin check on state-changing API routes (relies on SameSite=Lax only; Server Actions do have Next's built-in origin check). |
| H3 | Client-supplied file names are stored and returned unsanitised (control chars, bidi overrides, path separators). |
| H4 | No executable-content block independent of extension (e.g. a PE file renamed `.txt`/`.csv`/`.eml` passes — those types have no magic check). |
| H5 | No integrity re-verification: checksums are stored but never re-checked against stored objects. |
| H6 | AI system prompt does not tell the model to treat document content as untrusted data (prompt-injection hardening); no `AI_FALLBACK_MODEL` setting; no admin acknowledgement of the provider's data handling. |
| H7 | No offboarding workflow: suspending a user does not transfer their cases/tasks/deadlines/hearings. |
| H8 | Sensitive admin actions (role → owner, MFA reset, office export, privacy export) have no re-authentication (step-up). |
| H9 | `npm audit`: 3 high-severity advisories (transitive `deepmerge-ts` via `prisma`/`@prisma/config` dev tooling). |
| H11 | Client IP is taken from the **left-most** `X-Forwarded-For` entry, which the client controls: IP-based login/booking rate limits can be bypassed by sending a random header. |
| H10 | No database-level guard against hard deletion of legal records (application never hard-deletes them, but a bad script or migration could; `DocumentVersion` cascades from `Document`). |

## 6. Medium risks

- M1 Public booking form: rate-limited (5/h/IP) but no honeypot / timing check / pluggable bot protection.
- M2 No structured logging, no log redaction layer, no error-monitoring hook.
- M3 OCR/extraction runs on files that were never scanned.
- M4 No retention policy settings; client deletion semantics not documented.
- M5 No office-wide data export for the owner.
- M6 No large-data or load test; performance characteristics unknown beyond the demo dataset.
- M7 CSV neutralisation also prefixes negative **numbers** (`-5` → `'-5`, breaking numeric columns) and does not treat `*` or full-width variants of the trigger characters.
- M8 Rate limiter silently falls back to per-process memory when Redis is down (limits weaken with several instances).
- M9 `SameSite=Lax` session cookie; acceptable with origin checks, documented choice.

## 7. Low risks

- L1 Session list shows IP and user agent only (no geo — acceptable; no third-party geo-IP will be added).
- L2 Worker logs counts only; no heartbeat → queue health unobservable.
- L3 `prisma` CLI version drift warnings; lock file present (`package-lock.json`) — good.
- L4 Health of integrations only visible on the Integrations page, not in a system-health view.

## 8. Required infrastructure (production)

- MySQL 8.4 (managed, encrypted at rest, binary logs enabled for point-in-time recovery). *(Originally written as PostgreSQL 16; superseded — MySQL is the database of record.)*
- Redis 7 (rate limits; managed or same private network).
- S3-compatible private bucket with server-side encryption (SSE-S3 or SSE-KMS), block-public-access on, versioning on.
- A second, **off-site** bucket/account for encrypted backups.
- ClamAV `clamd` reachable on the private network (or an equivalent scanner behind the same interface).
- App container(s) + one worker container (same image), behind TLS termination (HTTPS only).
- SMTP relay (Microsoft 365 / Google Workspace SMTP relay / transactional provider) for resets, invitations and reminders.

## 9. Required secrets

`SESSION_SECRET`, `DATA_ENCRYPTION_KEY` (32-byte base64), `FILE_SIGNING_SECRET`, `BACKUP_ENCRYPTION_KEY` (32-byte base64, stored **outside** the production environment as well), `DATABASE_URL`, `REDIS_URL`, S3 credentials (`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`, or an instance role), backup-bucket credentials, `SMTP_USER`/`SMTP_PASSWORD`, optional `ANTHROPIC_API_KEY`, optional WhatsApp/SMS tokens, optional bot-protection secret, optional monitoring DSN.

## 10. Required external services

| Service | Needed for | Status at audit |
|---|---|---|
| Object storage (S3-compatible) | documents | **Not implemented** |
| Malware scanner (clamd) | uploads | **Not implemented** |
| SMTP | resets, invitations, e-mail reminders | **Adapter throws** |
| Off-site backup target | DR | **Not implemented** |
| AI provider (Anthropic) | optional AI features | Implemented, not verified with a live key |
| WhatsApp Business Cloud API / SMS | optional | Adapters throw |
| Calendar (Google / Microsoft) | optional | Not implemented |
| Error monitoring (Sentry-compatible) | ops | Not implemented |
| Independent penetration test, legal and privacy review | launch | **Not performed** (external) |
