# AH Legal OS — Delivery Report

> **Superseded in part (Phase 11).** This report describes phases 1–10, built on PostgreSQL. The project now runs on
> **MySQL 8.4** only; mentions of PostgreSQL, `pg_dump`, `pg_trgm` or full-text search below are historical.
> Current state: `docs/PRODUCTION-READINESS-REPORT.md`.

Status: all ten phases are built in one architecture on one connected core
(Client → Case → Hearing → Deadline → Task → Document → Invoice → Activity → Notification → Audit).
The unit, integration and browser suites all pass, and typecheck, lint and the production build are clean (see *Verification*).
The system has **not** been independently security-audited or legally reviewed. It is not claimed to be "100% compliant" with any regulation.

## 1. Implemented modules

| # | Module | Highlights |
|---|---|---|
| 1 | Auth and sessions | Argon2id, lockout, rate limits, optional TOTP MFA, hashed DB sessions, separate staff and portal realms, session management |
| 2 | Command Center | Morning brief, always-visible Next Hearing bar with countdown, customisable widgets, team workload (descriptive only, no scoring) |
| 3 | Deadline engine | Alert levels 7d/3d/24h/6h/1h (org-configurable), live countdowns, reminders stored as rows, escalation to the owner, acknowledgement |
| 4 | Cases | List views and saved columns, 10-step intake wizard with conflict check (possible matches only), numbering independent of court numbers |
| 5 | Case Workspace | Overview, timeline (manual, system, AI and imported entries, proposed then confirmed), hearings with reports that create follow-ups, preparation mode, checklists, team and access, notes, communications, documents, finance |
| 6 | UAE jurisdiction engine | Jurisdictions, courts, case types, workflows and checklists are admin-managed data; nothing is hard-coded |
| 7 | Document vault | Versioning, approval workflow, text extraction (PDF/DOCX/TXT), OCR adapter (not configured), search, signed URLs, per-document permissions |
| 8 | Clients | Client 360, contacts and relations, encrypted sensitive fields, privacy export |
| 9 | Team and RBAC | 11 system roles plus custom roles, 61 permissions, matter-level membership with ± overrides and expiry, access requests, temporary access |
| 10 | Calendar and planning | Day/week/month/agenda views, planner, drag to reschedule (appointments and tasks only), Hijri dates, Asia/Dubai time |
| 11 | Tasks and My Work | Buckets, dependencies (blocked until done), checklists, assignment |
| 12 | Collaboration | Private, team and client notes kept strictly separate, comments with @mentions, communication log, notification centre |
| 13 | Approvals | Documents, AI or imported deadline verification, access, finance, all from one inbox |
| 14 | Finance | Invoices with VAT, payments and refunds with overpayment guard, expenses, timers and time entries, print view |
| 15 | CRM | Pipeline board, lead conversion, website bookings arrive as leads and requested appointments |
| 16 | Client portal | Shared matters only, status text, next hearing, invoices, secure messages and uploads |
| 17 | Public website and CMS | Bilingual site (home, services, insights, about, contact, booking), SEO, sitemap/robots, placeholder banner, full CMS at `/app/website` |
| 18 | AI assistant | Q&A with page citations, summaries, timeline, task and deadline extraction. Review required, permission-checked, never acts on its own |
| 19 | Knowledge and templates | Knowledge base (confidential entries restricted), templates with case placeholders (missing values marked, never invented), save a draft as a case note |
| 20 | Reports | Case, court, lawyer, client-source, document, finance and workload reports with CSV export (formula-injection safe) |
| 21 | Court data import | Upload or paste, heuristic suggestions (AR/EN, Arabic-Indic digits), human review, applied as **Needs verification** |
| 22 | Governance | Hash-chained, DB-immutable audit log with chain verification and export, backups (pg_dump recorded honestly), privacy settings |
| 23 | Integrations | Honest status page: e-mail, SMS, WhatsApp Business API, OCR, S3 and AI show *Not connected* until configured |
| 24 | PWA and mobile | Manifest, conservative service worker (static assets and offline page only, never client data), mobile bottom nav, no horizontal scroll |

## 2. Database changes

- PostgreSQL 16 through Prisma: **71 models, 36 enums**, one baseline migration (`20260923163956_init`) plus raw SQL for:
  - audit triggers blocking UPDATE, DELETE and TRUNCATE on `AuditLog`
  - `Deadline_ai_requires_verifier`: AI or imported deadlines can't be CONFIRMED without a verifier
  - CHECK constraints on money and quantities: `Payment_amount_nonzero`, `InvoiceItem_qty_positive`, `Expense_amount_positive`, `TimeEntry_minutes_nonneg`
  - `pg_trgm` indexes for fuzzy name search and conflict checks, plus full-text search on document text
- All organisation data is keyed by `organizationId`, so it is ready to serve several offices.

## 3. API endpoints (route handlers)

| Endpoint | Purpose | Guard |
|---|---|---|
| `GET /api/search` | Global search (scoped to accessible matters) | staff session |
| `GET /api/lookup` | Pickers: clients, contacts, matters, users, courts | staff session |
| `GET/POST /api/notifications` | Notification centre | staff session |
| `GET/PATCH /api/tasks/[id]` | Task drawer | staff and matter capability |
| `POST /api/documents/upload` | Upload or new version | staff, `documents.upload`, rate limit |
| `GET /api/files/[versionId]` | Signed download or preview | HMAC signature and live permission re-check |
| `POST /api/court-import` | Court data suggestions | `deadlines.manage`, rate limit |
| `GET /api/reports/export` | Report CSV | `reports.view`, audited |
| `GET /api/audit/export` | Audit CSV | `audit.export`, audited |
| `GET /api/privacy/export/[clientId]` | Client data export | privacy permission, audited |
| `POST /api/portal/upload`, `GET /api/portal/files/[versionId]` | Portal files | client session, own matters only |

Everything else is done through typed server actions (`staffAction`) under `src/app/**/actions.ts`.

## 4. Permissions

- 61 permission keys across matters, hearings, deadlines, tasks, documents, notes, clients, finance, CRM, reports, knowledge, AI, team, settings, audit, integrations, CMS and portal.
- System roles: Owner, Managing Partner, Senior Lawyer (all matters); Lawyer, Junior Lawyer, Legal Assistant, Paralegal, Secretary, Read Only (assigned matters); Finance (no matter scope); Client (portal).
- Effective access = role permission ∩ matter capability. `HIGHLY_CONFIDENTIAL` matters need explicit membership, whatever the role. Document DENY always wins.

## 5. Automations

| Trigger | Actions |
|---|---|
| Hearing created | Preparation task for the attending lawyer; linked tasks move with the hearing if it is rescheduled |
| Document uploaded | Notify the lead lawyer |
| Case closed | Cancel open tasks and their reminders, create a closure-checklist task, request a finance review |
| Worker (every minute) | Dispatch due reminders, escalate unacknowledged ones, extract document text, expire temporary access |

Rules are data (enable or disable in Settings → Automations), and every run is logged.

## 6. Tests and verification

| Suite | Command | Result |
|---|---|---|
| Unit (49) | `npm test` | ✅ pass: RBAC rules, deadline levels and reminders, i18n AR/EN parity, VAT, audit canonical and redaction, CSV injection, templates, court-import parser, Dubai time |
| Integration (9) | `npm run test:integration` | ✅ pass: full chain on an isolated `_test` DB covering client, case, assign, restrict another lawyer, upload (magic-byte rejection), hearing and reminders dispatched, document approval, invoice with VAT, payment, overpayment blocked, close case (restricted to authorised users), audit chain verified, audit UPDATE/DELETE rejected by the DB |
| Browser E2E (18) | `npm run test:e2e` | ✅ pass (desktop and mobile): auth, 401s, httpOnly session, nothing sensitive in web storage, confidential case hidden, admin areas return 404, tampered file link returns 403, portal isolation, staff can't use the portal, RTL/LTR, CSP and security headers, robots, public site and booking reaching the CRM, module smoke tests, no horizontal scroll |
| Static | `npm run typecheck`, `npm run lint` | ✅ 0 errors (1 informational React Compiler notice about react-hook-form `watch`) |
| Build | `npx next build` | ✅ production build compiles |

Manual visual QA covered Arabic and English at desktop (1440), tablet (820) and mobile (390) for the Command Center, cases, workspace, Client 360, calendar, documents, finance, CRM, portal, public site, CMS, knowledge, templates, reports and court import.

## 7. Security controls

- Secrets only in `.env` (git-ignored), validated at start-up with no insecure fallbacks. There are no credentials in the repo; demo users are synthetic and documented.
- Sessions: hashed tokens, httpOnly and SameSite cookies, idle and absolute expiry, realm separation, lockout, rate limits, optional MFA.
- Authorisation: enforced in services, not only the UI. Matters you can't access return *not found*, so their existence isn't disclosed; denials are audited.
- Data: AES-256-GCM for Emirates ID, passport and MFA secrets; field-level visibility; audit snapshots are redacted.
- Files: extension allow-list, magic-byte check, SHA-256, no overwrite, path-traversal guard, signed and expiring links with live re-check.
- HTTP: CSP (`frame-ancestors 'none'`, `object-src 'none'`), HSTS, `X-Frame-Options`, `nosniff`, referrer and permissions policies, `poweredByHeader` off.
- Public forms: honeypot, IP rate limit, explicit consent. CSV exports are protected against formula injection.
- No government scraping or credential storage; no personal WhatsApp; AI never acts automatically; no win probability; no automated HR scoring.

## 8. Known limitations

- OCR for scanned images and PDFs is an adapter with no provider configured. Such files are marked *OCR unavailable*, never silently "done".
- The S3 storage driver is a stub; local disk storage is used. **Files are not encrypted by the application at rest.** Use an encrypted volume (e.g. BitLocker/LUKS) or S3 with server-side encryption in production.
- Court import uses heuristics. Excel (`.xlsx`) must be exported to CSV first, and suggestions always need human review.
- E-mail, SMS and WhatsApp delivery are adapters; reminders are delivered in-app until a provider is configured.
- AI has not been exercised against the live API in this environment (no key). Its code paths are typed and the UI reports "not configured".
- Real-time updates use refresh or polling (no websockets).
- The service worker only registers in production builds.
- The React Compiler skips memoizing the intake wizard because of react-hook-form `watch()`. This is harmless.

## 9. Integrations not configured

AI (`ANTHROPIC_API_KEY`), OCR (`OCR_PROVIDER`), SMTP, Microsoft 365 / Google Workspace mail, Google / Outlook calendar,
SMS provider, WhatsApp Business API, S3 object storage and accounting. Each shows its real status on `/app/integrations`.
Federal Justice, Dubai Courts and Abu Dhabi Judicial Department are marked *Unsupported* (no documented public API), and court data comes in through manual import.
AI uses model `claude-opus-5` (`AI_MODEL`) with adaptive thinking and server-side refusal fallbacks enabled by default.

## 10. Recommended next steps

1. Configure SMTP and the WhatsApp Business API, then enable the reminder channels per user.
2. Add an OCR provider (e.g. a hosted OCR API) through the adapter in `documents-processing.ts`.
3. Set `ANTHROPIC_API_KEY`, enable AI in Settings → AI, and run a supervised pilot on non-sensitive matters.
4. Replace the placeholder website content through the CMS and turn off the placeholder banner.
5. Before production: change or disable the demo accounts (`SEED_DEMO=false`), set real secrets, and configure S3 and backups off-site.
   Then commission an independent penetration test and a legal and privacy review (UAE PDPL and professional-conduct rules).
6. Optional: calendar sync (Google/Microsoft), e-signature, websocket live updates, more court-import formats (xlsx).
