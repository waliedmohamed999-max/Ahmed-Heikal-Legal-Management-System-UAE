# AH Legal OS — Production Readiness Report (Phase 11)

**Date:** 2026-09-24 · **Database of record: MySQL 8.4** · Baseline audit: `docs/PRODUCTION-AUDIT.md`

## Final status

# STAGING READY — PRODUCTION BLOCKERS REMAIN

Every code-level item of Phase 11 that can be built and tested inside the project is implemented and verified by
automated tests, a production-image run and backup/restore drills. It is **not** production-ready because the
production infrastructure does not exist yet (object storage, off-site backup target, e-mail, monitoring,
secret manager) and the external reviews have not been performed (see *L. Production blockers* and *M. External requirements*).

---

## Executive summary

- The project now runs **only on MySQL**. PostgreSQL is archived (`prisma/legacy-postgresql-migrations`, never executed).
- The baseline audit found **10 production blockers** and **8 critical risks**. Verification during Phase 11 then
  found five more real defects, all fixed and covered by tests:
  1. **Every authenticated API route failed in the production image.** The standalone build omitted Next's
     route-handler runtime.
  2. Case creation **deadlocked** on MySQL under concurrency.
  3. **Racing payments** could lose an update and bypass the overpayment check.
  4. **Global search leaked** the titles and OCR snippets of highly confidential documents.
  5. The background **worker could not start at all**.
- The security baseline now includes:
  - MFA hardening: replay protection, safe re-enrolment, recovery codes, per-role enforcement;
  - password reset and invitations, offboarding, step-up re-authentication;
  - malware quarantine (ClamAV), S3 storage with SSE and short-lived URLs, SHA-256 integrity sweeps;
  - database-enforced immutability of the audit log and legal records;
  - structured redacted logging, a nonce CSP, a CORS allowlist and trusted-proxy IP handling;
  - boot-time configuration validation that refuses unsafe production settings, including demo data.
- Test results:
  - **Unit:** 69/69.
  - **DB-backed integration + security:** 79/79.
  - **Browser E2E:** 27/27.
  - **Typecheck and lint:** clean (1 known warning).
  - **Production build:** clean.
  - **Docker image:** built and run in all three roles (web, worker, backup).

---

## MySQL Migration Verification

| Item | Result |
|---|---|
| Prisma provider | `mysql` (`prisma/schema.prisma`) |
| MySQL version tested | **MySQL 8.4.8** (Docker `mysql:8.4`); the dev client tools in the production image are MariaDB 10.11's `mysqldump`/`mysql` (flag-compatible handling built in) |
| MariaDB (local XAMPP) | `ahmedhiekal` on XAMPP **MariaDB 10.4.32** (not MySQL; `lower_case_table_names=1`): **PASS** in the finalisation step. 7/7 migrations applied, `migrate status` up to date, `migrate diff` against the schema empty, 75 tables, 24 triggers, 2 FULLTEXT indexes, MFA columns present. Audit INSERT ok, UPDATE and DELETE rejected, hard DELETE of a client rejected (test transaction rolled back). Foundation seed only: 1 organisation, 11 roles, 0 users, no demo data. **Local development only**: MariaDB 10.4 is end of life, and lower-case table names make its dumps non-portable to Linux MySQL. |
| Fresh migration (empty DB → latest) | **PASS** — `ahlegal_fresh`: all migrations applied; 24 integrity triggers present |
| Upgrade migration (pre-Phase-11 schema **with data** → latest) | **PASS** — `ahlegal_upgrade`: baseline applied + rows inserted (org, role, user, document version, reminder, notification delivery) → Phase 11 migrations applied; backfills verified (`scanStatus=NOT_SCANNED`, delivery keys set, reminder preserved) |
| Migrations | `20260924180000_mysql_init` (baseline incl. triggers) → `…190000_phase11_hardening` → `…190100_restorable_trigger_messages` → `…190200_trigger_bodies_begin_end` → `…190300_payment_idempotency` → `…190400_list_indexes` → `…190500_document_list_index`. No empty migration folders (checked). |
| Schema drift | `prisma migrate diff` from the migrated DB to the schema is empty (only intended changes were ever generated) |
| Integration test database | **PASS** — isolated `ahlegal_dev_test` is dropped, re-created, migrated and seeded on every run; 79/79 tests |
| Backup command | `node dist/backup.cjs all` (or `npm run backup -- all`): `mysqldump --single-transaction --quick --routines --triggers --events --hex-blob --no-tablespaces [--set-gtid-purged=OFF]` → gzip → AES-256-GCM, credentials via a 0600 defaults file / env, never on the command line |
| Restore result | **PASS** — isolated database created, backup decrypted and restored, 16 critical tables' counts verified, 7 relationship checks = 0 orphans, **24/24 triggers**, audit hash chain verified, isolated DB dropped. Verified (a) on the dev database from the host, (b) in `tests/security/backup.test.ts` (plus wrong-key and tampered-file rejection), (c) **inside the production image** against MySQL 8.4 |
| Trigger / safeguard status | Active (MySQL triggers, `BEGIN … END` form so dumps restore): AuditLog UPDATE/DELETE rejected; hard DELETE rejected on 12 legal tables; payment / invoice-item / time / expense validation; AI/import deadlines cannot be CONFIRMED without a verifier. Tested through the app's own DB client and raw SQL. |
| Full-text status | MySQL InnoDB **FULLTEXT** on `Document.searchText` and `Document.title` (boolean mode, prefix match); candidates are intersected with the permission scope **in the same query**; terms < 3 characters fall back explicitly to title `LIKE` |
| Known MySQL limitations | TRUNCATE / DROP do not fire triggers → the app DB user has no DROP/ALTER privilege (verified: the production image ran as such a user). FK cascades do not fire triggers → parents are protected. Single-statement triggers created in a batch store a trailing `;` that breaks `mysqldump` restores → all guard triggers use `BEGIN … END` (found by the restore test). `INSERT … ON DUPLICATE KEY UPDATE` counters deadlock → replaced (found by the concurrency test). Prisma `_count` with filters becomes whole-table aggregates on MySQL → replaced on hot paths (found by the performance test). FULLTEXT minimum token size 3 (InnoDB default). |

---

## A. MySQL migration status
Complete, as above. Development default: Docker MySQL 8.4 (`ahlegal_dev`). Local XAMPP (`ahmedhiekal`, MariaDB 10.4) is
migrated, verified and seeded with foundation data only. It is for local development, not a staging target.

## B. Security fixes (implemented and tested)
| Area | What changed | Evidence |
|---|---|---|
| Configuration | `src/server/config.ts`: Required / Production-required / Recommended (warnings) / Explicit risk acknowledgement (`STORAGE_LOCAL_ENCRYPTED_VOLUME`, `MALWARE_SCAN_NOT_CONFIGURED_ACK`); secrets must be distinct, non-placeholder, high-entropy; HTTPS; Redis; backup key; blank = unset. Validated at boot by web and worker. | unit tests; production build refused to start with dev settings (5 errors listed) |
| Demo data | opt-in (`db:seed:demo`), refused in production seed; production server and worker refuse to start while demo data exists | boot check; staging run on a non-demo DB |
| Bootstrap | `create-owner` (one-time set-password link, no password on the CLI, owner role requires MFA) | run on staging |
| Passwords | 12–256 chars, letters + digits, common/predictable bases rejected | tests |
| MFA | TOTP replay protection in MySQL (conditional UPDATE), pending-secret re-enrolment, 10 recovery codes (Argon2), per-role `requireMfa`, forced enrolment page, session rotation after MFA, step-up for sensitive actions | `tests/security/mfa.test.ts` (7 tests incl. concurrency) |
| Accounts | password reset (30 min, one-time, HMAC-stored, fragment URL, ends all sessions), invitations (7 days, email/role/case-bound, newer revokes older), admin: send reset, sign out everywhere, reset MFA (step-up), offboard (step-up, transfers work, keeps history), user: sign out other sessions | `concurrency-accounts.test.ts` |
| Sessions | HttpOnly, SameSite=Lax, Secure in production, idle 12 h / absolute 7 d, rotation after MFA, revocation, list with device/IP/last active (no geo-IP collected) | existing + new tests |
| Permissions / IDOR | every case tab stops before sensitive fetches (restricted/missing guard), service-level IDOR on tasks, documents, hearings, deadlines, notes, invoices, approvals, notifications, random ids | `permissions.test.ts`, `tests/e2e/security.spec.ts` |
| Search | single strict `documentScope` (fix of the highly-confidential leak), FULLTEXT candidates filtered in-query | regression test |
| Client portal | A cannot see/download/message/upload into B; no internal notes, unshared documents or hidden invoices; quarantined files refused | tests |
| Uploads | executables refused by content (PE/ELF/Mach-O/scripts), NUL bytes refused in text types, signature checks (PDF/OOXML/PNG/JPEG/OLE/WebP/TIFF), sanitised names (bidi/control/path), random UUID keys, `MAX_UPLOAD_MB` | tests |
| Malware | ClamAV INSTREAM client; PENDING → SCANNING → CLEAN / INFECTED / ERROR; infected: no preview, download, portal share, AI, OCR; audit + admin alert | tests with EICAR against real clamd |
| Integrity | SHA-256 per version; worker sweep re-hashes objects; MISMATCH / MISSING block access + alert | test tampers a stored file |
| Storage | S3 adapter (private, SSE-S3/SSE-KMS on every write, presigned GET only after permission + scan checks, TTL 300 s), local driver for dev / acknowledged encrypted volume | MinIO tests: SSE header, anonymous 403, presigned expiry |
| Audit | append-only (DB triggers), hash-chained, redacted; new events: MFA, step-up, reset, invite, offboard, backup, access blocked, malware, integrity, exports | tests |
| Logging | structured JSON, key- and value-based redaction (tokens, cookies, passwords, API keys, Emirates ID, IBAN, cards, document text), optional Sentry-compatible reporting with the same redaction; `onRequestError` hook | unit tests |
| Headers / CSP | per-request nonce, `strict-dynamic`, no `unsafe-inline` for scripts in production (styles keep it — React/Radix inline style attributes); HSTS, COOP, frame-ancestors none, Permissions-Policy | E2E header test |
| CORS / CSRF | cross-origin state-changing API calls refused (allowlist, empty default); Server Actions keep Next's origin check; SameSite cookies | E2E test |
| Rate limits | login (account + trusted IP), reset, MFA, step-up, booking, uploads, invitations, AI (20/10 min), search (60/min) | E2E: forged `X-Forwarded-For` does not bypass the account limit |
| Trusted proxy | IP from `X-Forwarded-For` counted from the right by `TRUSTED_PROXY_HOPS` | unit tests |
| Public forms | honeypot + server-signed form stamp (min fill time / replay) + optional Turnstile (off by default) | E2E booking waits like a human |
| AI | provider/model/fallback from env; permission + malware filter **before** retrieval; untrusted-content rules; no actions; identifier masking (default on); admin acknowledgement required; rate limit; "unavailable" on provider errors | `docs/AI-DATA-POLICY.md` |
| Finance | invoice row lock + re-validation, idempotency key on payments, void re-checked under lock, all changes audited | concurrency tests |
| Case numbering | counter via row-locking UPDATE + deadlock retry (`withTxRetry`) | 12 concurrent creations → 12 distinct `AH-YYYY-NNNNN` |
| CSV | formula-injection neutralised for `= + - @ * | %`, tab/CR/LF, full-width variants, leading spaces; numbers stay numeric; exports use the user's scope | unit tests |
| Error handling | error boundaries (global, root, app module, portal) with digest reference only; API/action errors normalised | build |
| PWA | service worker caches only `/_next/static` + offline page; verified by executing `sw.js` in a sandbox | unit test |
| Hard deletes | legal records protected by DB triggers; soft delete / archive only | tests |
| Office export | owner-only, step-up within 5 min, audited, NDJSON, no auth secrets, encrypted fields stay encrypted, tenant-scoped | build / manual |
| Deployment hygiene | standalone trace no longer pulls `.env`, backups, storage or tests into the server output (the web process no longer spawns `mysqldump`; backups requested from Settings run in the worker); `.dockerignore` | build inspection |
| Production image defects found and fixed | (1) Next 16.3's standalone trace omitted the **route-handler runtime** → every `app/api/**` route returned 500 in the image (on Windows it surfaced as "cookies() outside a request scope" because a second copy of Next was loaded); fixed with `outputFileTracingIncludes`. (2) `package-lock.json` generated on Windows lacked Linux-only optional packages → `npm ci` failed on Linux/CI; refreshed on Linux. (3) Worker/CLI bundles needed CommonJS output, bundled JS deps and request-API stubs to run from the standalone image. (4) The image healthcheck probes the web server, so the worker service disables it (monitored via heartbeat). | Docker build + run of web / worker / backup |
| Dev/demo data scan state | seeded documents were created `PENDING` with no scanner in development → unviewable; the seed now marks them `NOT_SCANNED` and the worker converts any `PENDING` version to `NOT_SCANNED` when no scanner is configured (never to CLEAN) | E2E + worker tick |
| UI | countdown hydration mismatch (text node not covered by `suppressHydrationWarning`) | E2E |

## C. Worker status
- Starts standalone (`node dist/worker.cjs` in the image; `npm run worker` in dev) — **verified in the production image**.
- Jobs: reminders → delivery queue → temporary-access expiry → malware scans → text extraction → integrity sweep → requested backups.
- Durable: leases (crash → re-claim), unique dedupe / delivery keys, retries with exponential backoff, FAILED after 5 attempts, heartbeat row.
- Tests: crash/lease re-claim, "sent but not acknowledged" retry without duplicate, 3 concurrent workers → 1 notification, retry/backoff/FAILED, SMTP delivery via Mailpit.

## D. Queue / Redis status
- **Queue: MySQL-backed and durable** (transactional with the events that create jobs). This is a deliberate design choice
  over a Redis queue: a job can never be lost between "event saved" and "job enqueued", and no Redis persistence tuning is needed.
- **Redis:** required in production for shared rate limits (verified reachable in the production run). If Redis is unreachable,
  limits fall back to per-process memory (weaker with several instances) — monitored via readiness (`redis: error`).

## E. Storage status
- S3 adapter: **LOCAL/STAGING VERIFIED** against MinIO (private objects, SSE-S3, presigned expiry, key validation).
- Production S3 bucket: **NOT CONFIGURED**.
- Local storage: development, or production only with explicit acknowledgement of an encrypted, backed-up volume.

## F. Malware scanning status
- ClamAV integration **LOCAL/STAGING VERIFIED** (real `clamd` 1.x container, EICAR test file detected and quarantined).
- Production scanner: **NOT CONFIGURED**. Existing pre-Phase-11 files are marked `NOT_SCANNED` (honest), not "clean".

## G. MFA status
Implemented and tested (see B). Owner role requires MFA by default for real deployments (`create-owner`); enable
**Require MFA** for admin, partner, lawyer and finance roles in Settings → Roles before go-live.

## H. Audit immutability status
Active on MySQL: UPDATE and DELETE rejected by triggers (tested via ORM and raw SQL); hash chain verified after restore.
TRUNCATE/DROP prevented by DB privileges (the app user has none). An emergency DBA correction would be a documented,
reviewed operation outside the application — there is no bypass in the application.

## I. Backup / restore result
**PASS** (encrypted backup, off-site copy to MinIO with SSE, retention, restore into an isolated database with full validation).
Production backup destination: **NOT CONFIGURED**. Production restore drill: **NOT PERFORMED** (no production database yet).

## J. Search status
MySQL FULLTEXT with permission filtering in the same query; regression test for the highly-confidential leak;
performance at 100k documents: global search 45–460 ms, document FULLTEXT list ≈ 0.75–0.85 s (tuning item).

## K. Tests
| Suite | Result |
|---|---|
| TypeScript | clean |
| ESLint | 0 errors, 1 warning (react-hook-form `watch()` cannot be memoised — pre-existing) |
| Unit (`npm test`) | **69/69** |
| DB-backed integration + security (`npm run test:integration`) | **79/79** (9 core flow + 70 security) |
| Browser E2E (`npx playwright test`, desktop + mobile, incl. `tests/e2e/security.spec.ts`) | **27/27** (final run on a warm dev server; the first run hit dev-compile timeouts and exposed the seed scan-state and countdown bugs, both fixed) |
| Production build | clean (no tracing warnings) |
| Docker image | built; runs as uid 10001; web / worker / backup roles verified |
| Large-data test (10k clients, 20k cases, 100k tasks, 100k documents) | case list 60–130 ms, dashboard services ≤ 150 ms (after fixes), tasks list 1.25 s → 0.39–0.44 s, documents list ≈ 0.5 s |
| Load test (production image, 10 concurrent users, 30 s, 20k cases) | 0 errors; ≈ 12 req/s on this single Windows/Docker machine; p50: case details 508 ms, case list 823 ms, search API 388 ms, dashboard 1.6 s, documents list 1.3 s |

### Negative tests covered
Unauthorised access · expired / reused / revoked invitation and reset tokens · expired and tampered file links · wrong
permission (junior approval, no-finance user) · malformed and disguised uploads · executables · infected upload ·
duplicate jobs (concurrent workers, idempotency keys) · duplicate payments · racing payments · wrong timezone
boundaries (23:30 UTC, 00:30 Dubai, month/year change, no DST) · AI provider unavailable (code path returns
"unavailable"; **NOT VERIFIED WITH LIVE PROVIDER**) · storage down (readiness reports it; tested by the probe) ·
database reconnect (restore drill / readiness) · CSV formula injection · cross-origin requests · forged
`X-Forwarded-For` · demo data / unsafe config in production.

### Not verified
- AI with a live key — **NOT VERIFIED WITH LIVE PROVIDER**.
- SMS (Twilio) and WhatsApp Business Cloud API — **NOT VERIFIED** (no accounts).
- Error monitoring endpoint — **NOT VERIFIED** (no DSN).
- Calendar sync — **NOT IMPLEMENTED** (hearings/appointments are in-app; external sync would need OAuth apps and a
  per-user data-sharing choice; internal deadlines are never sent outside by default).
- Image OCR — **NOT CONFIGURED** (text PDFs / DOCX / text are extracted; scanned images need a provider).
- Independent penetration test — **NOT PERFORMED**.

## L. Production blockers (remaining)
1. Production **S3 bucket** (private, SSE, versioning, replication) — NOT CONFIGURED.
2. Production **malware scanner** (clamd on the private network) — NOT CONFIGURED.
3. **Off-site backup destination** (separate account/region) and the nightly schedule — NOT CONFIGURED; first production restore drill — NOT PERFORMED.
4. **Managed MySQL 8.4** with PITR, least-privilege app / migration / backup users — NOT PROVISIONED.
5. **E-mail (SMTP relay)** for resets, invitations and reminders — NOT CONFIGURED (fallback: admin one-time links).
6. **Secret manager** with freshly generated, distinct secrets and an escrowed backup key — NOT PROVISIONED.
7. **Error monitoring / uptime alerts** — NOT CONFIGURED.
8. **HTTPS domain + reverse proxy** (`TRUSTED_PROXY_HOPS` set to the real hop count) — NOT PROVISIONED.
9. **MFA required** switched on for all privileged roles, and the owner enrolled — to do at go-live.
10. Performance tuning for the documents list / FULLTEXT and the dashboard under concurrency, and horizontal scaling
    of the web tier, if the office expects > 10 concurrent heavy users.
11. **Client-portal account provisioning**: NOT IMPLEMENTED. Only the demo seed creates portal users (`docs/TECH-DEBT.md` TD-002).
12. **`deepmerge-ts` advisory** (GHSA-ggr8-5vv4-36mx, 3 high `npm audit` entries): Prisma CLI only, present in the migrate image and not the runtime image. Open until the Prisma 7 migration (`docs/TECH-DEBT.md` TD-001).
13. **Hosted staging environment**: NOT PROVISIONED. Topology and smoke test are defined in `docs/STAGING-SETUP.md`; every smoke-test item is NOT RUN.

## M. External requirements
- Independent **penetration test** — NOT PERFORMED (preparation: `docs/SECURITY-TESTING.md`).
- **Legal review** and **privacy review** (UAE PDPL, professional obligations, retention) — NOT PERFORMED.
- Data processing agreements with hosting, storage, e-mail and AI providers; AI provider retention terms reviewed.
- Staff training; DR drill with measured RTO / RPO.

> The system is not certified and is not claimed to be legally compliant. Production deployment should undergo
> independent legal, privacy and security review.

## Infrastructure requirements
MySQL 8.4 (managed, encrypted, PITR) · Redis 7 · S3-compatible private bucket + replica · off-site backup bucket ·
ClamAV `clamd` · SMTP relay · container runtime for the image (web ×N, worker ×1, backup CronJob, migrate job) ·
TLS reverse proxy / load balancer · secret manager · monitoring.

## Environment variables
Complete, annotated list: `.env.example` (Required / Production-required / Recommended / Acknowledged risk).
Validation rules: `src/server/config.ts`.

## Storage architecture
Objects keyed `org/document/version.ext` (UUIDs); never overwritten; SSE on write; downloads: signed app link
(user + version + expiry) → live permission + scan + integrity checks → presigned object URL (≤ 5 min) or streamed
preview; SHA-256 recorded per version and re-verified by the worker.

## RBAC / IDOR results
All permission and IDOR tests pass (service level: `tests/security/permissions.test.ts`; HTTP level:
`tests/e2e/security.spec.ts` — every case tab, API objects by id, file links, portal cross-client access).

## Deployment procedure
1. Build the image in CI (`docker build --target runtime`), tag with the commit.
2. Run the **migrate** job (`--target migrate`, migration DB user): `prisma migrate deploy`.
3. Deploy web (N replicas) and worker (1 replica) from the same tag; `RUN_WORKER_IN_PROCESS=false` on web.
4. Wait for `/health/ready` = 200; smoke test (sign in, open case, upload, download).
5. Migrations follow **expand → migrate → contract**: never drop or rename a column holding data in the same release that stops using it.

## Rollback procedure
Redeploy the previous image tag (kept ≥ 3). Because migrations are additive (expand/contract), the previous app version
runs on the newer schema. If a migration failed: `prisma migrate status`; fix forward with a new migration, or restore the
pre-release backup into a new database and repoint (see `docs/DISASTER-RECOVERY.md` §7). Never edit an applied migration.

## N. Repository state
Phase 11 is committed as 14 logical commits (`e1fbd88` … `2cce749`), followed by the finalisation docs commit
(`6fabe61`: staging setup, env template, tech-debt register) and this report update. The working tree is clean. The
commits are grouped by file: a file that touches several concerns sits with its main concern, and only the final state
is build-verified. The `.gitignore` rules for local data are now anchored to the repository root, because the
unanchored `backups/` rule had kept `src/app/app/settings/backups/` out of version control since an earlier phase.

## O. Finalisation (2026-09-24)
- **Cleanup:** test databases `ahlegal_verify`, `ahlegal_large`, `ahlegal_stg_large`, `ahlegal_fresh` and
  `ahlegal_upgrade` dropped, along with the temporary `ahl_app` user. The legacy container `ahlegal-postgres` was
  removed after confirming no compose file, script or runtime dependency references it (its old named volume
  `ahmedheikallegalmanagementsystemuae_ahlegal_pg` is kept and can be deleted by hand). No `pg` / `pg-boss` package remains.
- **XAMPP `ahmedhiekal`:** see *MySQL Migration Verification*.
- **Prisma advisory:** assessed in `docs/TECH-DEBT.md` (TD-001).
- **Docker rebuild from committed source:** **NOT VERIFIED YET.** The `runtime` image built successfully from `git archive` of `6fabe61` (exact committed source). Docker Desktop then crashed during the `migrate` image build, so the web / worker / backup smoke tests have **not** been re-run on the final commit. The last verified run (web, worker, backup `all`) used the pre-commit working tree. Re-run: `docker build --target runtime` and `--target migrate` from HEAD, then the three roles.
- **Checks on the committed tree:** `tsc` clean, ESLint 0 errors (1 known warning), unit 69/69.
