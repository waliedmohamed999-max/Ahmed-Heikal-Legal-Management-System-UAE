# Architecture

## Shape

One Next.js application, one **MySQL 8.4** database (the database of record), Redis, S3-compatible object
storage, ClamAV, and one background worker.

```
Browser ──► proxy.ts (nonce CSP, cross-origin guard, cookie gate, optional host split)
           ├─ (site)/*          public website (server-rendered, CMS-driven)
           ├─ app/*             internal app (server components + server actions)
           ├─ portal/*          client portal (separate session realm)
           ├─ api/*             JSON / file endpoints (staffRoute wrapper)
           └─ health/*          liveness / readiness (status only)
                 │
        src/server/services/*   business logic: every read/write goes through here
                 │
        Prisma ─► MySQL 8.4      integrity triggers (append-only audit log, no hard deletes of legal
                                 records, deadline / finance validation), FULLTEXT indexes
        storage ─► S3 (private, server-side encrypted) or local disk     clamd ─► malware verdicts
        worker/  ─► reminders, delivery queue (SMTP / SMS / WhatsApp), malware scans, text extraction,
                    integrity sweep, temporary-access expiry            (all job state durable in MySQL)
        backup   ─► encrypted mysqldump → off-site bucket → nightly restore test
```

Every organisation-owned table carries `organizationId`, and every service query is scoped by it.
This keeps the model SaaS-ready: one deployment can serve several offices.

## Layers

| Layer | Location | Rule |
|---|---|---|
| Pure domain logic | `src/lib/*` | No I/O. Access rules, deadline engine, VAT maths, templates, court-import parser, schemas, CSV, masking. Unit-tested. |
| Configuration | `src/server/config.ts` | Environment schema and production rules, validated at boot (web and worker). |
| Services | `src/server/services/*` | Take an authenticated `StaffContext` and **already-parsed** input (`z.output<>`). Enforce permissions, write audit and activity rows, run automations. |
| Server actions | `src/app/**/actions.ts` | `staffAction(schema, handler)`: parse, call the service, revalidate. They return `ActionResult` and never throw raw errors to the client. |
| API routes | `src/app/api/**` | `staffRoute(handler)`: session and MFA check, rate limit, error normalisation, `no-store`. Used for uploads, files, exports and lookups. |
| UI | `src/components/*`, pages | Server components by default. Client components only for interaction. Error boundaries at root, app and portal level. |

## Security model

- **Sessions.** Random 256-bit token in an httpOnly, SameSite=Lax, Secure (production) cookie; only its SHA-256 is
  stored. Expiry is 7 days absolute and 12 h idle. Staff (`ahl_s`) and portal (`ahl_p`) realms are separate. The token
  is rotated after MFA. Users see their sessions (device, IP, last active) and can end one or all others; admins can
  end a user's sessions.
- **Passwords.** Argon2id; 12–256 characters with letters and digits; common / predictable bases rejected. Accounts
  lock after repeated failures; login, reset, MFA and step-up are rate-limited (Redis, per account and per trusted IP).
- **MFA.** TOTP with replay protection (last accepted time-step stored in MySQL, claimed with a conditional UPDATE,
  so it holds across instances); re-enrolment keeps the active factor until the new one is proven (pending secret);
  10 one-time recovery codes stored as Argon2 hashes; per-role enforcement (`Role.requireMfa`); step-up
  re-authentication for sensitive actions (changing an authenticator, admin MFA reset, offboarding, office export).
- **Accounts.** One-time tokens (only an HMAC is stored) for password reset (30 min) and invitations (7 days, bound to
  e-mail, role and optional cases); links carry the token in the URL fragment. Offboarding suspends the user, ends
  sessions and tokens, transfers open work and keeps all history.
- **Authorisation.** Effective capability = *role permission ∩ matter capability*.
  - Role `matterScope`: `ALL`, `ASSIGNED` or `NONE`.
  - Matter membership roles: OWNER, LEAD, ASSIGNED, ASSISTANT, OBSERVER, DOCUMENTS_ONLY, each with ± overrides and an optional expiry.
  - `HIGHLY_CONFIDENTIAL` matters and documents need explicit membership, whatever the role. Unauthorised users get *not found*.
  - Documents add per-document VIEW, EDIT or DENY rules; DENY always wins. One strict `documentScope` is used by
    lists, search, the AI and exports.
  - Field-level: Emirates ID and passport numbers are AES-256-GCM encrypted and shown only with `clients.viewSensitive`.
- **Files.** Allow-listed extensions plus content checks (executables refused whatever the extension, NUL bytes refused
  in text types), sanitised display names, random UUID storage keys, SHA-256 per version, never overwritten.
  Lifecycle: PENDING (quarantined) → SCANNING → CLEAN | INFECTED. Nothing is previewed, downloaded, shared, OCR'd or sent
  to AI unless CLEAN (or NOT_SCANNED where no scanner is configured). An integrity sweep re-hashes stored objects and
  blocks mismatches. Links are HMAC-signed (user + version + expiry + disposition); permission is re-checked on every
  request; S3 downloads then redirect to a presigned URL valid for `SIGNED_URL_TTL_SECONDS` (default 300).
- **Sharing.** Documents are *Internal only* by default; *Client shared* only by an explicit action of someone with
  `documents.share`; *Restricted* (highly confidential) documents can never be shared to the portal.
- **Audit.** Append-only table, hash-chained per organisation (canonical JSON, serialised by a row lock on the
  organisation). MySQL triggers reject UPDATE and DELETE; the application's database user has no DROP/ALTER
  privilege, so TRUNCATE is not possible for the app either. `verifyAuditChain` detects tampering. Secrets are redacted.
- **Legal records.** MySQL triggers reject hard DELETE on clients, matters, documents, versions, hearings, deadlines,
  invoices, payments, timeline events, notes, communications and approvals (soft delete / archive only).
- **Transport and headers.** Per-request nonce CSP (`strict-dynamic`, no `unsafe-inline` for scripts in production;
  styles keep `unsafe-inline` for React/Radix style attributes), HSTS, `X-Frame-Options: DENY` (except inline PDF
  preview), `nosniff`, COOP, a strict referrer policy and a permissions policy. Cross-origin state-changing API calls
  are refused (allowlist `CORS_ALLOWED_ORIGINS`, empty by default).
- **Client IP.** Taken from `X-Forwarded-For` counted from the right by `TRUSTED_PROXY_HOPS`, so forged entries
  cannot dodge IP rate limits.
- **Configuration.** Production refuses to start with demo data, missing / placeholder / reused secrets, plain-HTTP
  URLs, no Redis, no backup key, or unacknowledged local storage / missing malware scanning.
- **Logging.** Structured JSON logs with key- and value-based redaction (tokens, cookies, passwords, API keys,
  Emirates ID, IBAN, card numbers, document text); optional Sentry-compatible error reporting with the same redaction.
- **Browser storage.** Nothing sensitive is kept in LocalStorage, SessionStorage, IndexedDB or Cache Storage; the
  service worker caches only `/_next/static` and the offline page (verified by a unit test).

## Deadline engine, reminders and jobs

- Alert levels are computed from org-configurable thresholds (defaults 7d, 3d, 24h, 6h, 1h) in `src/lib/deadline.ts`.
- Reminders are **materialised rows** (`syncReminders`) created whenever a hearing, deadline, task or appointment changes.
- The worker claims due reminders with a lease (a crashed worker's jobs are re-claimed after the lease expires),
  creates the in-app notification and marks the reminder SENT in **one transaction** (unique dedupe key, so a retry
  can never notify twice), retries failures with backoff, and escalates to the owner when not acknowledged.
- External channels use a separate durable delivery queue (one row per notification + channel, unique `deliveryKey`).
  E-mail is SMTP; SMS (Twilio) and WhatsApp (official Cloud API, templates only) are adapters.
- The queue lives in MySQL, transactional with the events that create it; Redis holds only rate-limit counters.
- AI-extracted and imported deadlines are `NEEDS_VERIFICATION`. MySQL triggers (`Deadline_validate_insert/update`)
  stop them being CONFIRMED without a verifier.

## Automations

Rules are stored as data (`Automation` rows) and run inside the triggering transaction:

| Trigger | Default actions |
|---|---|
| `hearing.created` | preparation task for the attending lawyer. If the hearing is rescheduled, its tasks shift by the same delta. |
| `document.uploaded` | notify the lead lawyer |
| `matter.closed` | cancel open tasks and their reminders, create a closure-checklist task, request a finance review |

Each run is logged (`AutomationRun`). Owners can enable or disable rules in Settings → Automations.

## AI

`src/server/services/ai/*` uses the Anthropic SDK with `AI_PROVIDER`, `AI_MODEL` and `AI_FALLBACK_MODEL` from the
environment, adaptive thinking and server-side refusal fallbacks.

- Document Q&A uses page-level citations. Structured tasks return schema-validated output with a source per item.
- Documents are filtered by permission and malware state **before** retrieval; document text is framed as untrusted
  data (prompt-injection rules in the system prompt); identifiers can be masked before sending.
- Results are proposals only: a person must accept them. The AI cannot send, approve, delete, share, invite,
  change permissions or deadlines, or close cases.
- An admin must acknowledge the data policy before AI can be enabled (docs/AI-DATA-POLICY.md). Requests are rate-limited.
- Without a key the UI shows "not configured"; if the provider is down, AI reports "unavailable" and nothing else is affected.

## Internationalisation and time

- The dictionaries in `src/i18n/messages` (base plus modules) are type-checked for AR/EN parity, and a unit test enforces it.
- `dir` and `lang` follow the locale. Numbers and codes are isolated LTR inside RTL text.
- The database stores UTC; all presentation and business rules use `Asia/Dubai` (`@date-fns/tz`), UTC+4 without DST
  (unit-tested for day, month and year boundaries). Hijri dates use `Intl` (islamic-umalqura).

## Module map

| Area | Pages | Services |
|---|---|---|
| Command Center, agenda, planner | `/app`, `/app/agenda`, `/app/planner` | `dashboard`, `agenda` |
| Cases and workspace | `/app/cases/**` | `matters`, `workspace`, `health`, `collab` |
| Clients, contacts, conflict check | `/app/clients/**`, `/app/contacts` | `clients`, `matters.conflictCheck` |
| Hearings, deadlines, calendar, appointments | `/app/calendar`, `/app/hearings/*`, `/app/appointments` | `events`, `reminders` |
| Tasks, My Work | `/app/tasks`, `/app/my-work` | `tasks` |
| Documents and approvals | `/app/documents/**`, `/app/approvals` | `documents`, `documents-processing`, `malware`, `integrity`, `fulltext`, `approvals` |
| Finance | `/app/finance/**`, `/print/invoices/*` | `finance`, `finance-queries` |
| CRM and booking | `/app/crm`, `/book` | `crm` (+ `server/bot.ts` form protection) |
| Knowledge and templates | `/app/knowledge`, `/app/templates` | `knowledge` |
| Reports | `/app/reports`, `/api/reports/export` | `reports` |
| Court data import | `/app/integrations/import`, `/api/court-import` | `court-import` |
| AI assistant | `/app/ai` | `ai/*` |
| Team, settings, audit, integrations | `/app/team/**`, `/app/settings/**`, `/app/audit`, `/app/integrations` | `admin`, `auth/account`, `auth/mfa`, `audit-query`, `backup`, `channels`, `system-health` |
| Account flows | `/login/forgot`, `/reset-password`, `/invite`, `/login/mfa`, `/login/mfa-setup` | `auth/*` |
| Client portal | `/portal/**` | `portal` |
| Public website and CMS | `/(site)/**`, `/app/website` | `site` |

## Testing

- `tests/unit`: pure rules (RBAC, deadlines, reminders, VAT, audit canonicalisation, CSV injection, i18n parity,
  templates, court-import parser) plus security rules (production config, log redaction, trusted proxy, masking,
  FULLTEXT query building, Dubai time, service-worker caching).
- `tests/integration`: the full connected flow through real services on an isolated MySQL `<db>_test` database.
- `tests/security`: DB-backed attempts to break the system — MFA replay and safe re-enrolment, audit immutability,
  hard-delete guards, IDOR on every object type, portal client isolation, search isolation, uploads and malware
  quarantine (real ClamAV), S3 privacy and URL expiry (real MinIO), worker crash / retry / idempotency, SMTP delivery
  (Mailpit), concurrency (case numbering, payments, tokens), offboarding, encrypted backup + restore test.
- `tests/e2e`: Playwright browser checks for auth, permission boundaries over HTTP (every case tab), portal isolation,
  RTL/LTR, security headers and CSP, CORS, rate limiting with forged `X-Forwarded-For`, the public site and booking,
  and page smoke tests on desktop and mobile.
