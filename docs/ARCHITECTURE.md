# Architecture

## Shape

One Next.js application, one PostgreSQL database and one background worker.

```
Browser ──► proxy.ts (cookie gate, optional host split)
           ├─ (site)/*          public website (server-rendered, CMS-driven)
           ├─ app/*             internal app (server components + server actions)
           ├─ portal/*          client portal (separate session realm)
           └─ api/*             JSON / file endpoints (staffRoute wrapper)
                 │
        src/server/services/*   business logic: every read/write goes through here
                 │
        Prisma ─► PostgreSQL     (audit triggers, CHECK constraints, trigram + FTS indexes)
        worker/  ─► reminders, escalations, text extraction, temporary-access expiry
```

Every organisation-owned table carries `organizationId`, and every service query is scoped by it.
This keeps the model SaaS-ready: one deployment can serve several offices.

## Layers

| Layer | Location | Rule |
|---|---|---|
| Pure domain logic | `src/lib/*` | No I/O. Access rules, deadline engine, VAT maths, templates, court-import parser, schemas. Unit-tested. |
| Services | `src/server/services/*` | Take an authenticated `StaffContext` and **already-parsed** input (`z.output<>`). Enforce permissions, write audit and activity rows, run automations. |
| Server actions | `src/app/**/actions.ts` | `staffAction(schema, handler)`: parse, call the service, revalidate. They return `ActionResult` and never throw raw errors to the client. |
| API routes | `src/app/api/**` | `staffRoute(handler)`: session and MFA check, rate limit, error normalisation, `no-store`. Used for uploads, files, exports and lookups. |
| UI | `src/components/*`, pages | Server components by default. Client components only for interaction. Shared schemas come from isomorphic `src/lib/*-schemas.ts`. |

## Security model

- **Sessions.** Random 256-bit token in an httpOnly, SameSite=Lax cookie; only its SHA-256 is stored.
  Expiry is 7 days absolute and 12 h idle. Staff (`ahl_s`) and portal (`ahl_p`) realms are separate.
  Passwords use Argon2id, accounts lock after repeated failures, TOTP MFA is optional, and login is rate-limited.
- **Authorisation.** Effective capability = *role permission ∩ matter capability*.
  - Role `matterScope`: `ALL`, `ASSIGNED` or `NONE`.
  - Matter membership roles: OWNER, LEAD, ASSIGNED, ASSISTANT, OBSERVER, DOCUMENTS_ONLY, each with ± overrides and an optional expiry.
  - `HIGHLY_CONFIDENTIAL` matters need explicit membership, whatever the role. Unauthorised users get *not found*, so a matter's existence isn't revealed.
  - Documents add per-document VIEW, EDIT or DENY rules; DENY always wins.
  - Field-level: Emirates ID and passport numbers are AES-256-GCM encrypted and shown only with `clients.viewSensitive`.
- **Files.** Allow-listed extensions plus magic-byte checks, SHA-256 checksum, and never overwritten (new versions only).
  Download URLs are HMAC-signed (user + version + expiry + disposition), and permission is re-checked on every request.
- **Audit.** Append-only table, hash-chained per organisation (canonical JSON, advisory lock).
  Database triggers block UPDATE, DELETE and TRUNCATE. `verifyAuditChain` detects tampering. Secrets are redacted before writing.
- **Transport and headers.** HSTS, CSP, `X-Frame-Options: DENY` (except inline PDF preview), `nosniff`, a strict referrer policy and a permissions policy.
- **Browser storage.** Nothing sensitive is kept in LocalStorage or SessionStorage (covered by an E2E test).

## Deadline engine and reminders

- Alert levels are computed from org-configurable thresholds (defaults 7d, 3d, 24h, 6h, 1h) in `src/lib/deadline.ts`.
- Reminders are **materialised rows** (`syncReminders`) created whenever a hearing, deadline, task or appointment changes.
  The worker claims due rows atomically, delivers them in-app plus any connected channel, and escalates to the owner if they aren't acknowledged.
- AI-extracted and imported deadlines are `NEEDS_VERIFICATION`. The DB constraint `Deadline_ai_requires_verifier` stops them being CONFIRMED without a verifier.

## Automations

Rules are stored as data (`Automation` rows) and run inside the triggering transaction:

| Trigger | Default actions |
|---|---|
| `hearing.created` | preparation task for the attending lawyer. If the hearing is rescheduled, its tasks shift by the same delta. |
| `document.uploaded` | notify the lead lawyer |
| `matter.closed` | cancel open tasks and their reminders, create a closure-checklist task, request a finance review |

Each run is logged (`AutomationRun`). Owners can enable or disable rules in Settings → Automations.

## AI

`src/server/services/ai/*` uses the Anthropic SDK with model `AI_MODEL` (default `claude-opus-5`),
adaptive thinking, and server-side refusal fallbacks enabled.

- Document Q&A uses page-level citations. Structured tasks (timeline, tasks, deadlines) return schema-validated output with a source document and page for each item.
- Results are proposals only: a person must accept them. Accepted deadlines become `NEEDS_VERIFICATION`, and timeline items become `PROPOSED`.
- Every run is permission-checked per document and logged as an `AIJob`.
- Without an API key the UI shows "not configured"; no request is attempted.

## Internationalisation and time

- The dictionaries in `src/i18n/messages` (base plus modules) are type-checked for AR/EN parity, and a unit test enforces it.
- `dir` and `lang` follow the locale. Numbers and codes are isolated LTR inside RTL text.
- All scheduling uses `Asia/Dubai` (`@date-fns/tz`). Hijri dates use `Intl` (islamic-umalqura).

## Module map

| Area | Pages | Services |
|---|---|---|
| Command Center, agenda, planner | `/app`, `/app/agenda`, `/app/planner` | `dashboard`, `agenda` |
| Cases and workspace | `/app/cases/**` | `matters`, `workspace`, `health`, `collab` |
| Clients, contacts, conflict check | `/app/clients/**`, `/app/contacts` | `clients`, `matters.conflictCheck` |
| Hearings, deadlines, calendar, appointments | `/app/calendar`, `/app/hearings/*`, `/app/appointments` | `events`, `reminders` |
| Tasks, My Work | `/app/tasks`, `/app/my-work` | `tasks` |
| Documents and approvals | `/app/documents/**`, `/app/approvals` | `documents`, `documents-processing`, `approvals` |
| Finance | `/app/finance/**`, `/print/invoices/*` | `finance`, `finance-queries` |
| CRM and booking | `/app/crm`, `/book` | `crm` |
| Knowledge and templates | `/app/knowledge`, `/app/templates` | `knowledge` |
| Reports | `/app/reports`, `/api/reports/export` | `reports` |
| Court data import | `/app/integrations/import`, `/api/court-import` | `court-import` |
| AI assistant | `/app/ai` | `ai/*` |
| Team, settings, audit, integrations | `/app/team/**`, `/app/settings/**`, `/app/audit`, `/app/integrations` | `admin`, `audit-query`, `backup`, `channels` |
| Client portal | `/portal/**` | `portal` |
| Public website and CMS | `/(site)/**`, `/app/website` | `site` |

## Testing

- `tests/unit`: pure rules (RBAC, deadlines, reminders, VAT, audit canonicalisation, CSV injection, i18n parity, templates, court-import parser).
- `tests/integration`: the full connected flow through real services on an isolated `<db>_test` database
  (client → case → assign → restrict → upload → hearing → reminders → approval → invoice → payment → close → audit chain and immutability).
- `tests/e2e`: Playwright browser checks for auth, permission boundaries, portal isolation, RTL/LTR, security headers, the public site and booking, and page smoke tests on desktop and mobile.
