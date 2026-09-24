# Incident Response

**Roles:** Incident lead = the Owner (or the person the Owner designates); technical lead = the IT provider / engineer
on call. Keep a timeline of every action. Record security incidents in **Settings → Privacy → Breach log**
(the audit log is append-only and is the primary evidence source).

Legal obligations (e.g. UAE PDPL notification duties, professional-conduct rules, contractual notice to clients)
must be assessed by the office's legal / privacy advisers — this runbook does not decide them.

---

## 1. Security incident (general)
1. **Triage** — what is affected (accounts, cases, documents, infrastructure)? Assign a severity (LOW / MEDIUM / HIGH / CRITICAL).
2. **Contain** — revoke sessions, suspend accounts, rotate secrets, block IPs at the edge, take the service offline if needed.
3. **Preserve evidence** — export the audit log (Audit → Export) for the window; keep server logs; do not wipe hosts.
4. **Eradicate & recover** — fix the cause, restore from verified backups if data changed (BACKUP-RESTORE §5).
5. **Notify** — per legal advice; record the decision and time in the breach log.
6. **Review** — within 10 days: root cause, what detected it, what would have detected it sooner, actions with owners.

## 2. Account compromise (staff)
- Sign out everywhere, suspend, reset MFA (Settings → Users). Verify the person's identity out of band before issuing a reset link.
- Audit review: filter the audit log by the actor for logins (`auth.login`), downloads (`document.downloaded`),
  exports (`report.exported`, `privacy.office_exported`, `privacy.data_exported`), permission changes (`permission.*`).
- If client data left the office, treat as **data exposure** (below).

## 3. Client portal account compromise
- Suspend the client user; revoke sessions; review `portal.*` audit events (downloads, uploads, messages).
- Check whether uploaded files passed malware scanning.

## 4. Data exposure
- Identify exactly which records / documents (audit log `document.downloaded`, `document.previewed`, exports).
- Contain (revoke access, rotate links — file links expire in minutes; revoke sessions).
- Legal / privacy assessment of notification duties; notify clients as advised.
- Record in the breach log with affected data categories and actions taken.

## 5. Malware upload
- The scanner quarantines the file (`INFECTED`); it cannot be previewed, downloaded, shared, OCR'd or sent to AI,
  and administrators receive a critical notification (`document.malware_detected` in the audit log).
- Actions: confirm the uploader (staff or client portal); if a client uploaded it, contact them through a known
  channel; if a staff device is suspected, isolate the device and reset that user's credentials.
- The quarantined object stays in storage for evidence. Purging it is a reviewed DBA / storage operation.
- If a file was downloaded **before** scanning was configured (`NOT_SCANNED`), re-scan by setting its status to
  `PENDING` (the worker scans it) and check the audit log for who downloaded it.

## 6. Lost or stolen device
- Staff: Sign out everywhere; if the authenticator was on the device, Reset MFA and re-enrol on the new device;
  change the password. The PWA stores no case data offline, and nothing sensitive is kept in browser storage.
- Office laptop with local synced files: follow the office's device-management procedure (remote wipe).

## 7. Suspicious login
- Signals: many `auth.login_failed` / `auth.login_blocked_locked`, logins at unusual hours, `auth.mfa_failed` bursts,
  a new device in the user's sessions list.
- Accounts lock automatically after repeated failures; login is rate-limited per account and per IP.
- Confirm with the user; if not them: treat as account compromise (§2).

## 8. Contacts (to be filled by the office)
| Role | Name | Phone | E-mail |
|---|---|---|---|
| Incident lead (Owner) | | | |
| Technical lead / IT provider | | | |
| Hosting provider support | | | |
| Legal / privacy adviser | | | |
