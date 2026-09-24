# Staging Setup

Staging is a **production rehearsal**. It runs the same image, the same `NODE_ENV=production`
validation and the same service topology as production, with **synthetic data only**.
Database of record: **MySQL 8.4**.

Status of this document: the topology and procedures are defined. **No hosted staging
environment exists yet.** The local `docker compose --profile stack` run is a single-machine
approximation, not staging.

---

## 1. Topology

```
                    Internet
                       │  HTTPS (TLS 1.2+, HSTS)
              ┌────────▼─────────┐
              │ Reverse proxy /  │  terminates TLS, sets X-Forwarded-For
              │ load balancer    │  → TRUSTED_PROXY_HOPS=1
              └────────┬─────────┘
                       │ private network
         ┌─────────────┼───────────────────────────────┐
         │             │                               │
  ┌──────▼──────┐ ┌────▼─────┐                   ┌─────▼──────┐
  │ app (web)   │ │ worker   │ same image tag    │ backup job │ CronJob, nightly
  │ node        │ │ node     │                   │ node       │ dist/backup.cjs all
  │ server.js   │ │ dist/    │                   └─────┬──────┘
  │ ×1..N       │ │ worker   │ ×1                      │
  └──┬──┬──┬──┬─┘ └┬──┬──┬───┘                         │
     │  │  │  │    │  │  │                             │
     │  │  │  └────┼──┼──┼──► SMTP sandbox / relay     │
     │  │  └───────┼──┼──┴──► ClamAV clamd :3310       │
     │  └──────────┼──┴─────► S3-compatible bucket ◄───┤ (storage backup)
     │             │           (private, SSE, versioned)
     ├─────────────┴────────► Redis 7 (rate limits)    │
     └──────────────────────► MySQL 8.4 ◄──────────────┤
                                                       └──► Off-site backup bucket
                                                            (separate account/region)
  Monitoring: uptime probes on /health/live and /health/ready, error DSN, log shipping,
              alert on backup-job failure and on a stale worker heartbeat.
  One-off:    migrate job (image target `migrate`) before each deploy.
```

| Component | Staging choice | Mirrors production? |
|---|---|---|
| Application (web) | Image target `runtime`, `node server.js`, port 3100, ≥ 1 instance | Yes |
| Worker | Same image, `node dist/worker.cjs`, exactly 1 instance; `RUN_WORKER_IN_PROCESS=false` on web | Yes |
| Migrations | Image target `migrate` (`prisma migrate deploy`), run once per release **before** web/worker | Yes |
| MySQL | **MySQL 8.4** (managed instance preferred; container acceptable for staging). utf8mb4, UTC, binary logging on, `log_bin_trust_function_creators=ON`. **Linux** (`lower_case_table_names=0`). | Yes (production adds PITR + HA) |
| Redis | Redis 7, private network, no public port | Yes |
| Object storage | Private S3-compatible bucket (a separate AWS bucket, or MinIO with KMS so SSE is real): block public access, versioning on, `S3_SSE` set | Yes |
| Malware scanning | ClamAV `clamd` on the private network, `MALWARE_SCANNER=clamav`; signature updates running | Yes |
| Backup destination | `BACKUP_DIR` on a persistent volume **and** `BACKUP_S3_BUCKET` in a different account (or at least a different bucket with its own write-only credentials) | Yes |
| HTTPS | Real certificate on a staging hostname (e.g. `staging.<domain>`); HSTS | Yes |
| E-mail | **Either** an SMTP sandbox/catcher (Mailpit or a provider sandbox) so no mail reaches real people, **or** `EMAIL_PROVIDER=none` explicitly (reset/invite links are then shown once to the admin) | Partly — production uses a real relay |
| Monitoring | Uptime probes, `MONITORING_DSN` (a staging project, separate from production), log retention | Yes |
| AI / SMS / WhatsApp | Disabled (`AI_PROVIDER=none`, `SMS_PROVIDER=none`, no WhatsApp token) unless a specific test needs a sandbox key | Optional |

Networking rules: only the reverse proxy is public. MySQL, Redis, ClamAV and the worker are never
exposed. The object store is reached by the app only; browsers receive short-lived presigned URLs
(≤ `SIGNED_URL_TTL_SECONDS`, 300 s default).

---

## 2. Environment variables

Start from `.env.example`. Staging runs with `NODE_ENV=production`, so every `[REQUIRED]` and
`[PROD]` rule is enforced, and the server and worker **refuse to start** otherwise. Everything
marked `[SECRET]` comes from the secret manager. Staging values must be **different** from production
values: never copy a staging secret to production or the other way round.

Minimum staging set (values are placeholders):

```
NODE_ENV=production
APP_URL=https://staging.<domain>
TRUSTED_PROXY_HOPS=1
DATABASE_URL=mysql://<app_user>:<secret>@<mysql-host>:3306/ahlegal_staging     # least-privilege app user
REDIS_URL=redis://<redis-host>:6379
SESSION_SECRET=<secret>            DATA_ENCRYPTION_KEY=<base64 32 bytes>
FILE_SIGNING_SECRET=<secret>       BACKUP_ENCRYPTION_KEY=<base64 32 bytes>
SEED_DEMO=false
STORAGE_DRIVER=s3  S3_BUCKET=…  S3_REGION=…  [S3_ENDPOINT=… S3_FORCE_PATH_STYLE=true for MinIO]  S3_SSE=AES256
MALWARE_SCANNER=clamav  CLAMAV_HOST=<clamd-host>  CLAMAV_PORT=3310
EMAIL_PROVIDER=smtp (sandbox) | none
BACKUP_S3_BUCKET=…  BACKUP_S3_REGION=…  BACKUP_S3_ACCESS_KEY_ID=…  BACKUP_S3_SECRET_ACCESS_KEY=…
MONITORING_DSN=<staging project DSN>
RUN_WORKER_IN_PROCESS=false
AI_PROVIDER=none   SMS_PROVIDER=none
```

Do **not** set `STORAGE_LOCAL_ENCRYPTED_VOLUME=true` or `MALWARE_SCAN_NOT_CONFIGURED_ACK=true` in
staging. Staging exists to exercise the real S3 and ClamAV paths.

Database users (create them once, as MySQL admin):

| User | Privileges | Used by |
|---|---|---|
| `ahl_migrate` | `CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER, SELECT, INSERT, UPDATE, DELETE` on `ahlegal_staging.*` | migrate job only |
| `ahl_app` | `SELECT, INSERT, UPDATE, DELETE, CREATE TEMPORARY TABLES, LOCK TABLES, SHOW VIEW, TRIGGER` on `ahlegal_staging.*` | web + worker |
| `ahl_backup` | `SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT` on `ahlegal_staging.*`; `ALL` on `` `ahlegal\_restore\_%`.* `` | backup job (dump + isolated restore test) |

---

## 3. Staging safety rules

1. **`SEED_DEMO=false`, always.** `npm run db:seed:demo` is refused under `NODE_ENV=production`,
   and the web server and worker refuse to start if demo organisations or users exist
   (`src/server/boot-checks.ts`). A synthetic *demo* environment, if ever needed for sales or
   training, must be a **separate** stack with its own database, bucket, secrets and hostname,
   run as a non-production environment. It is never "staging".
2. **No real legal client data.** No real names, Emirates ID or passport numbers, case numbers,
   documents or e-mail addresses. Use obviously synthetic values (e.g. `Test Client 001`,
   `*.example.test` addresses, invented Emirates IDs such as `784-0000-0000000-0`).
   Production data is never restored into staging.
3. **Synthetic data sources:** records created by hand during the smoke test below. For volume
   testing, `npm run perf:large` refuses any database whose name does not end in `_large`, so run it
   against a separate `ahlegal_staging_large` database, never the staging database itself.
4. **E-mail cannot reach real people:** sandbox SMTP, or `EMAIL_PROVIDER=none`.
5. **Access:** staging sits behind the office VPN or an IP allowlist at the proxy, and every
   staff account uses MFA. Staging accounts are personal (no shared logins).
6. **Separate everything:** its own MySQL database, bucket, backup bucket, Redis, secrets and
   monitoring project. Staging credentials can never read production resources.

---

## 4. First deployment

```bash
# 1. Build once and tag; the same tag is used for migrate, web, worker and backup
docker build -t ahlegal:<git-sha> --target runtime .
docker build -t ahlegal-migrate:<git-sha> --target migrate .

# 2. Migrate (as ahl_migrate)
docker run --rm -e DATABASE_URL=<migrate-user-url> ahlegal-migrate:<git-sha>

# 3. Foundation seed — organisation, roles, permissions. No --demo.
#    (run from a checkout of the same commit, with DATABASE_URL = migrate user)
npm run db:seed

# 4. Start web and worker (as ahl_app), then check readiness
curl -fsS https://staging.<domain>/health/ready        # every component "ok"

# 5. Bootstrap the first owner: prints a one-time set-password link (30 min)
docker run --rm --env-file <staging env> ahlegal:<git-sha> node dist/create-owner.cjs --email <owner@…> --name "<name>"

# 6. Owner sets a password, enrols MFA, switches "Require MFA" on for admin/partner/lawyer/finance
# 7. Invite the staging testers (Settings → Users → Invite)
# 8. Schedule the backup job and run it once by hand
docker run --rm --env-file <staging env backup user> ahlegal:<git-sha> node dist/backup.cjs all
```

Local approximation, one machine (not staging): `docker compose --profile stack up --build`
with a `.env.staging` file that is never committed.

---

## 5. Staging smoke test

Run this after every staging deploy. Record the date, image tag and tester, and write each result as
PASS, FAIL or NOT RUN. Use synthetic data only.

| # | Area | Steps | Expected |
|---|---|---|---|
| 1 | Health | `GET /health/live`, `GET /health/ready`; Settings → System health | `ok`; database, Redis, storage and scanner all ok; worker heartbeat < 2 min old |
| 2 | Login | Sign in as a staff user; wrong password ×3; forgot-password flow (sandbox mail or admin link) | Success; generic error with no account enumeration; reset link works once, then is rejected |
| 3 | MFA | Enrol TOTP; sign out and in; reuse the same 6-digit code at once; use one recovery code; use it again | Enrolment ok; the reused code is **rejected**; the recovery code works once only |
| 4 | MFA enforcement | Role with "Require MFA" and a user without MFA signs in | Forced to `/login/mfa-setup`; API calls return 401 until enrolled |
| 5 | Create client | Clients → New (synthetic client, synthetic Emirates ID) | Created; Emirates ID shown masked; audit entry written |
| 6 | Create case | Cases → New for that client, with a responsible lawyer | Case number allocated; appears in the case list |
| 7 | Restricted case access | Mark the case Highly Confidential and remove the tester's colleague; the colleague opens every case tab by URL and searches for its title | Restricted screen on **every** tab; no title, number or document in the HTML, search or API (404) |
| 8 | Document upload | Upload a PDF to the case | Status goes Pending → Clean; SHA-256 recorded; the object exists in the private bucket with SSE |
| 9 | Malware scan | Upload a file that contains only the standard EICAR test string (harmless by design) | Marked **Infected**, never downloadable or shareable; admins notified; audit entry `document.malware_detected` |
| 10 | Signed document access | Download the clean document; copy the link; retry after expiry; retry signed in as another user; tamper with `sig` | First download works (presigned URL ≤ 5 min); expired, cross-user and forged links all return 403 |
| 11 | Hearing creation | Add a hearing to the case (Dubai date and time) | Shown in Asia/Dubai time; appears in agenda and calendar |
| 12 | Reminder worker | Create a hearing or task due within the reminder window; wait one worker cycle | One delivery per reminder (idempotent), even after restarting the worker; the in-app notification appears |
| 13 | Deadline confirmation | Add a deadline from an import or the AI source; a verifier approves it | Cannot be CONFIRMED without a verifier; after approval, confirmed with the verifier recorded |
| 14 | Search permissions | Search a term that exists in the restricted case and in an open case, as the restricted colleague | Only open-case results; no snippets from restricted documents |
| 15 | Invoice | Create and issue an invoice for the case | Invoice number allocated; totals are correct; printable view works |
| 16 | Payment | Record a payment; double-click submit; try to overpay | Recorded **once**; overpayment refused |
| 17 | Audit log | Settings → Audit log; filter by the case | Entries for every step above; hash chain verifies |
| 18 | Backup | `node dist/backup.cjs db` then `storage` | Encrypted `.enc` files plus manifest; off-site copy in `BACKUP_S3_BUCKET`; no password in the logs |
| 19 | Restore test | `node dist/backup.cjs restore-test` | Isolated DB restored; table counts and relations match; 24 triggers; audit chain ok; isolated DB dropped |
| 20 | Client portal | **NOT RUNNABLE on a non-demo staging environment**: there is currently no supported way to create a portal (client) account outside the demo seed. Staff invitations reject the `client` role. See *Known gaps*. | — |
| 21 | Security headers | `curl -I https://staging.<domain>/login` | CSP with nonce and `strict-dynamic`, HSTS, `X-Frame-Options: DENY`, `nosniff`, no `X-Powered-By` |
| 22 | Rate limit | 11 failed logins for one account from rotating forged `X-Forwarded-For` values | The 11th is refused ("too many attempts") |

---

## 6. Known gaps (staging)

- **Client-portal account provisioning — NOT IMPLEMENTED.** Portal users are created only by the
  demo seed. Portal isolation is covered by the automated tests (demo data, isolated test DB), but
  it cannot be smoke-tested on a real staging environment until a provisioning path exists. This
  is a product decision; Phase 11 deliberately added no new features.
- Calendar sync, image OCR and SMS/WhatsApp are not part of staging unless sandbox credentials are
  provided.
- No hosted staging environment has been provisioned yet. Every item in section 5 is **NOT RUN**
  on real staging.
