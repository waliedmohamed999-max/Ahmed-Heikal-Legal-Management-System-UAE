# Production Checklist

Tick every item before go-live. Items marked **(ext)** are external — they cannot be completed in code.
Database of record: **MySQL 8.4**.

## Environment & secrets
- [ ] `NODE_ENV=production`, `APP_URL` (and `CLIENT_PORTAL_URL` if split) use `https://`
- [ ] `SESSION_SECRET`, `DATA_ENCRYPTION_KEY` (32-byte base64), `FILE_SIGNING_SECRET`, `BACKUP_ENCRYPTION_KEY` (32-byte base64)
      generated fresh (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), **all different**,
      stored in the secret manager — never in the repository or image
- [ ] `BACKUP_ENCRYPTION_KEY` escrowed offline (two sealed copies)
- [ ] `TRUSTED_PROXY_HOPS` matches the real number of reverse proxies (1 behind one load balancer; 0 if exposed directly)
- [ ] `CORS_ALLOWED_ORIGINS` empty unless a specific origin is required
- [ ] The server starts (configuration validation passes) — it refuses to start otherwise

## Database (MySQL 8.4)
- [ ] Managed MySQL 8.4 with encryption at rest, automated backups and binary logs (PITR) enabled
- [ ] Application user with **least privilege** on its schema only: `SELECT, INSERT, UPDATE, DELETE, CREATE TEMPORARY TABLES, LOCK TABLES, SHOW VIEW, TRIGGER`
      (no `DROP`, `ALTER`, `CREATE`, `SUPER`, `GRANT`). A separate **migration user** (`CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER`) is used only by the migrate job.
      *(Verified in Phase 11: the production image ran the full app against MySQL 8.4 as such a least-privilege user.)*
- [ ] A **backup user** for the nightly job: on the app schema `SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT`; plus
      `ALL` on `ahlegal\_restore\_%` so the restore test can create, fill and drop its isolated database. The app user never gets these.
- [ ] `log_bin_trust_function_creators=ON` (or the migration user has the privilege to create triggers with binary logging on)
- [ ] `character_set_server=utf8mb4`, `collation_server=utf8mb4_unicode_ci`, server time zone UTC
- [ ] `npx prisma migrate deploy` run from the **migrate** image target; `prisma migrate status` = up to date
- [ ] `npm run db:seed` (foundation only — **no** `--demo`); `npm run create-owner -- --email … --name …`; owner set password + enrolled MFA
- [ ] Demo users disabled / absent (the server refuses to start otherwise)

## Storage & files
- [ ] `STORAGE_DRIVER=s3`, private bucket, block public access ON, versioning ON, SSE-S3 or SSE-KMS (`S3_SSE`), replication to a second bucket
- [ ] Bucket policy denies unencrypted uploads and non-TLS access
- [ ] `MALWARE_SCANNER=clamav` with clamd reachable on the private network (signatures updating); `SIGNED_URL_TTL_SECONDS` ≤ 900
- [ ] Upload size limit (`MAX_UPLOAD_MB`) agreed; reverse-proxy body limit ≥ that value

## Identity & access
- [ ] MFA enabled for the owner (enforced) and **Require MFA** switched on for admin, partner, lawyer and finance roles
- [ ] Roles and permissions reviewed with the office; every staff account invited (no shared accounts)
- [ ] E-mail (`EMAIL_PROVIDER=smtp`) configured so resets and invitations are delivered — or the admin one-time-link fallback accepted
- [ ] Offboarding procedure agreed (Settings → Users → Offboard)

## Operations
- [ ] Web and worker deployed from the same image tag; worker running (`node dist/worker.cjs`); `RUN_WORKER_IN_PROCESS=false` on web
- [ ] Redis reachable (`REDIS_URL`) — rate limits shared across instances
- [ ] Nightly `node dist/backup.cjs all` scheduled; first run **and restore test** passed; off-site bucket (`BACKUP_S3_BUCKET`) in another account/region
- [ ] Uptime monitor on `/health/live` and `/health/ready`; alerting on backup job failure
- [ ] Error monitoring (`MONITORING_DSN`) configured, or log-based alerting in place
- [ ] System health page: all modules Healthy or deliberately Not configured
- [ ] Domain on HTTPS with HSTS; TLS certificate auto-renewal
- [ ] Security headers validated on the live domain (CSP with nonce, HSTS, frame-ancestors none)
- [ ] Previous image tags retained for rollback (≥ 3)

## Integrations (only if required for launch)
- [ ] AI: key configured, **data policy acknowledged** in Settings → AI, identifier masking decided, tested with a live key
- [ ] WhatsApp Business Cloud API / SMS: official accounts, approved templates, tested live
- [ ] Calendar sync: not implemented (hearings/appointments are in-app only)

## External (ext)
- [ ] **(ext)** Independent penetration test completed and findings fixed — see `docs/SECURITY-TESTING.md`
- [ ] **(ext)** Legal / privacy review (UAE PDPL, professional-conduct and retention obligations, AI provider terms)
- [ ] **(ext)** Data processing agreements with hosting, storage, e-mail and AI providers
- [ ] **(ext)** Staff trained (MFA, phishing, handling of client data, incident reporting)
- [ ] **(ext)** Disaster-recovery drill performed and timed (RTO / RPO confirmed)

> This checklist does not certify legal or regulatory compliance. Production deployment should undergo independent
> legal, privacy and security review.
