# Disaster Recovery

Targets (to be confirmed by the office): **RPO ≤ 24 h** with nightly backups (≤ 5 min with managed MySQL PITR),
**RTO ≤ 4 h** for the web app and database. Run a full recovery drill at least once per quarter and record the result.

For every scenario: **Detection → Containment → Recovery → Verification.** Record actions and times in the incident log.

---

## 1. Database lost or corrupted
- **Detection:** `/health/ready` returns 503 (`database: error`); System health shows Database = Error; app errors in logs.
- **Containment:** scale app and worker to zero so nothing writes to a damaged database. Keep the damaged instance for forensics.
- **Recovery:** follow `docs/BACKUP-RESTORE.md` §5 — restore the latest verified backup (or PITR) into a **new** database,
  validate, repoint `DATABASE_URL`, then `prisma migrate status` (must report no pending or failed migrations).
- **Verification:** restore-test report green; sign in; recent cases and documents open; audit chain verifies;
  compare the last audit entries with the time of the incident to state exactly which window was lost.

## 2. Server / container host lost
- **Detection:** uptime monitor on `/health/live` fails; load balancer marks targets unhealthy.
- **Containment:** none needed (stateless); make sure the old host cannot come back with stale secrets (revoke its credentials).
- **Recovery:** deploy the same image tag to a new host / node pool with the same secrets from the secret manager; run the
  worker; the queue resumes from MySQL (leases expire and jobs are re-claimed — nothing is lost).
- **Verification:** `/health/ready` 200; System health → worker seen < 3 min; reminders overdue = 0 after one tick.

## 3. Document storage unavailable
- **Detection:** `/health/ready` → `storage: error`; downloads return errors; System health → Document storage = Error.
- **Containment:** the app keeps working for everything except files; uploads fail cleanly (nothing half-written).
- **Recovery:** restore service / fail over to the replica bucket (update `S3_BUCKET` / `S3_REGION`); for local storage,
  restore the latest encrypted document archive.
- **Verification:** open several recent documents; run the integrity sweep (worker) — every version must be `OK`;
  any `MISSING` / `MISMATCH` is listed in System health and the audit log.

## 4. Credentials / secrets compromised
- **Detection:** leaked secret reported, unexpected cloud activity, or secret found in a repository or log.
- **Containment (immediately):** rotate the affected secret in the secret manager and redeploy:
  - `SESSION_SECRET` → invalidates all reset / invitation links; also revoke all sessions (SQL: `UPDATE Session SET revokedAt = NOW() WHERE revokedAt IS NULL`).
  - `FILE_SIGNING_SECRET` → all outstanding file links die (they expire in minutes anyway).
  - `DATA_ENCRYPTION_KEY` → **cannot simply be replaced**: encrypted fields (Emirates ID, passport, MFA secrets) must be
    re-encrypted with a key-rotation script run by an engineer; plan this, do not improvise it.
  - Database / S3 / SMTP / AI credentials → rotate at the provider; the old ones stop working.
  - `BACKUP_ENCRYPTION_KEY` → rotate as in BACKUP-RESTORE §6; treat existing backups as exposed.
- **Recovery:** review the audit log for the exposure window (logins, exports, downloads).
- **Verification:** old credentials rejected; System health all green; notify affected parties if data exposure is confirmed (INCIDENT-RESPONSE).

## 5. Employee account compromised
- **Detection:** suspicious login alerts, unusual downloads / exports in the audit log, user report.
- **Containment:** Settings → Users → **Sign out everywhere**; suspend or **Offboard** the account; **Reset MFA** if the
  device is lost; issue a new password-reset link only after verifying identity out of band.
- **Recovery:** review the audit log for that actor (documents downloaded, cases viewed, exports, permission changes)
  and revert unauthorised changes.
- **Verification:** no active sessions for the user; audit chain verifies; privacy assessment recorded.

## 6. Document deleted by mistake
- Documents are **soft-deleted** (the database refuses hard deletes of legal records); file objects are never
  overwritten or deleted by the app.
- **Recovery:** an administrator clears `deletedAt` (a reviewed DB change), and the document reappears with all versions.
- **Verification:** integrity check of its versions = `OK`; audit entry recorded.

## 7. Bad deployment
- **Detection:** error rate spike (monitoring), failing `/health/ready`, users reporting errors.
- **Containment / recovery:** roll back to the previous image tag (keep at least the last three). Database migrations are
  **expand → migrate → contract**: a release only adds columns / tables; destructive changes ship one release later,
  so the previous app version keeps working on the newer schema.
- If a migration itself failed: `prisma migrate status` shows it; fix forward with a new migration, or mark it rolled
  back (`prisma migrate resolve --rolled-back <name>`) after restoring the pre-release backup. Never edit an applied migration.
- **Verification:** health green; smoke tests (sign in, open case, upload, download) pass.

## 8. Region-wide outage
- Requires a second region: off-site backups (different account / region) + replica document bucket + the image in
  a registry reachable from the second region. Restore the latest backup there and repoint DNS. This is an
  infrastructure decision for the office; it is **not configured** today.
