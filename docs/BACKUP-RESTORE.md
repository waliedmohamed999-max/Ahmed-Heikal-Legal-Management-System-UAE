# Backup & Restore (MySQL)

**Database of record: MySQL 8.4.** Backups are logical `mysqldump` snapshots, encrypted before they touch disk,
copied off-server, and **restored into an isolated database every night** to prove they work.
A backup that has not been restored is not considered verified.

## 1. What is backed up

| Data | Mechanism | Encryption | Off-server |
|---|---|---|---|
| Database | `npm run backup -- db` → `mysqldump --single-transaction --routines --triggers --events` → gzip → AES-256-GCM | `BACKUP_ENCRYPTION_KEY` (client-side) + SSE on the bucket | `BACKUP_S3_BUCKET` (another account / region) |
| Documents (S3) | Bucket **versioning** + **cross-region / cross-account replication** (infrastructure) | SSE-S3 / SSE-KMS | replica bucket |
| Documents (local disk, only if acknowledged) | `npm run backup -- storage` → tar → gzip → AES-256-GCM | `BACKUP_ENCRYPTION_KEY` | `BACKUP_S3_BUCKET` |
| Point-in-time | MySQL binary logs (managed service PITR, or `binlog_expire_logs_seconds` ≥ 7 days) | provider | provider |

Each database backup writes two files: `db-<db>-<timestamp>.sql.gz.enc` and `…manifest.json` containing the SHA-256 of
the encrypted file, its size, the **key id** (a non-secret fingerprint of the key), the server version and the row
counts of 16 critical tables. The manifest never contains the password or the key (tested).

## 2. Schedule

Run **nightly** (e.g. 01:00 Asia/Dubai) from the production image:

```bash
node dist/backup.cjs all          # db backup → off-site copy → retention prune → storage backup → restore test
```

- Kubernetes `CronJob`, a systemd timer, cron, or Windows Task Scheduler — any scheduler that alerts on a non-zero exit.
- Retention: `BACKUP_RETENTION_DAYS` (default 35) locally and off-site; the two newest backups are never pruned.
- Every run is recorded in `BackupRecord` and shown in **Settings → System health** (last backup, last document
  backup, last restore test). A failed run exits with code 1.

## 3. Credentials never appear in commands or logs

- Native tools read a temporary `--defaults-extra-file` created with mode `0600` and deleted afterwards.
- The Docker mode (`MYSQL_DOCKER_CONTAINER`) passes `MYSQL_PWD` through the environment of `docker exec`, not as an argument.
- `mysqldump` / `mysql` stderr is redacted before it is logged.

## 4. Verification — the restore test

`node dist/backup.cjs restore-test` (also part of `all`):

1. Check the encrypted file's SHA-256 against the manifest.
2. Select the key by key id (current key or `BACKUP_ENCRYPTION_KEYS_PREVIOUS`).
3. `CREATE DATABASE ahlegal_restore_<timestamp>` (isolated; never the live database).
4. Decrypt (AES-GCM authentication fails on any tampering) → gunzip → `mysql` into the isolated database.
5. Validate:
   - row counts of 16 critical tables ≥ the counts recorded at dump time;
   - 7 relationship checks (no case without client, version without document, hearing without case, payment
     without invoice, member without user, user without role, audit row without organisation);
   - the integrity triggers are present (≥ 24);
   - the audit hash chain of every organisation verifies.
6. `DROP DATABASE` the isolated copy (use `--keep` to inspect it manually).

**Verified in this project:** on MySQL 8.4.8 (Docker) the full cycle passed on the development database and in the
automated test (`tests/security/backup.test.ts`, which also proves that a wrong key and a tampered file are rejected).
**Not yet verified:** against the production database and the production off-site bucket (they do not exist yet).

## 5. Restore procedure (real incident)

1. **Stop writes**: scale the app and worker to zero (or enable maintenance at the load balancer).
2. **Pick the backup**: the newest successful one before the incident (`backups/*.manifest.json` or the off-site bucket).
   For a point-in-time restore, use the managed service's PITR to the minute before the incident instead.
3. **Restore into a new database** (never over the old one — keep it for forensics):
   ```bash
   # decrypt + restore with the same engine the nightly test uses
   node dist/backup.cjs restore-test --keep     # restores the newest backup into ahlegal_restore_<ts> and validates it
   ```
   Or restore a specific file by copying it (and its manifest) into `BACKUP_DIR` first.
4. **Validate** the report output (all checks green), then run `npx prisma migrate status` against the restored database.
5. **Point `DATABASE_URL`** at the restored database (rename it if your naming requires), restart app and worker.
6. **Verify** in the app: sign in, open recent cases, run Settings → Audit → verify chain, check System health.
7. **Documents**: for S3, restore object versions to the incident time from bucket versioning if needed; the integrity
   sweep will flag any stored object whose SHA-256 no longer matches the database.
8. Record the incident and the restore in the breach / incident log (Settings → Privacy) and `docs/INCIDENT-RESPONSE.md`.

## 6. Key management and rotation

- `BACKUP_ENCRYPTION_KEY` is a 32-byte key (base64) held in the production secret manager **and** in an offline escrow
  (e.g. two sealed copies held by the owner and the office manager). Without it, backups cannot be read — by design.
- It must be different from every other secret (enforced at boot).
- **Rotation without losing old backups**:
  1. Generate a new key; set it as `BACKUP_ENCRYPTION_KEY`.
  2. Move the old key into `BACKUP_ENCRYPTION_KEYS_PREVIOUS` (comma-separated list).
  3. New backups use the new key; restores pick the right key automatically by the key id in each manifest.
  4. Remove an old key from the list only after every backup encrypted with it has aged out of retention.
- Never log, print or commit a key. The application never does.

## 7. Disaster recovery

See `docs/DISASTER-RECOVERY.md` for scenarios (database lost, server lost, storage unavailable, credentials
compromised, bad deployment) and recovery objectives.
