# Security Testing Guide (penetration-test preparation)

**Status: an independent penetration test has NOT been performed.** This guide prepares one.
Test only against a **staging** deployment with synthetic data (`npm run db:seed:demo`), never production.

## Environment for testers
- Staging stack: `docker compose --profile stack up --build` (app on `127.0.0.1:3200`) or a cloud staging copy.
- Accounts (synthetic): see README → Demo accounts. Portal: `client@demo.ahlegal.test`. A second portal client can
  be created by an admin to test cross-client isolation.
- MFA: enable on one account to test replay / recovery codes.
- Mail: Mailpit UI (`127.0.0.1:8025`) receives reset and invitation e-mails.

## Scope and what to try
| Area | Entry points | Expected behaviour |
|---|---|---|
| Authentication | `/login`, `/portal/login`, `/login/mfa`, `/login/forgot`, `/reset-password#…`, `/invite#…` | Generic errors, lockout, per-account and per-IP limits, TOTP replay rejected, tokens one-time and expiring |
| Session management | cookies `ahl_s` / `ahl_p` | HttpOnly, SameSite=Lax, Secure; rotation after MFA; server-side revocation; idle and absolute expiry |
| RBAC / privilege escalation | server actions, `/api/*` | Role permissions enforced server-side; owner-only actions need step-up |
| IDOR | every id: cases, documents, versions, tasks, hearings, deadlines, invoices, approvals, notifications | Objects outside the user's scope return *not found* |
| File upload | `/api/documents/upload`, `/api/portal/upload` | Executables and disguised binaries refused; malware quarantined; names sanitised |
| File download | `/api/files/<id>?exp&sig`, `/api/portal/files/<id>` | Links bound to user + version + expiry; permission re-checked; presigned S3 URLs expire |
| Client portal | `/portal/**` | Only own, portal-enabled matters and explicitly shared items |
| CSRF | server actions, `/api/*` POST | Origin checks (Next.js server actions + proxy guard); SameSite cookies |
| XSS | CMS articles, names, notes, file names | React escaping; CSP with nonce; no `dangerouslySetInnerHTML` |
| SQL injection | search, filters | Prisma parameterised queries; raw SQL only as tagged templates with bound values |
| Rate limiting | login, reset, booking, uploads, AI, search | 429 / "rate limited"; forged `X-Forwarded-For` does not bypass |
| Headers | all | CSP nonce, HSTS, nosniff, frame-ancestors none, COOP, Permissions-Policy |

## Automated coverage already in the repository
- `npm run test:security` — DB-backed suites (MFA, audit immutability, hard-delete guards, IDOR, portal isolation,
  search isolation, uploads + malware + integrity, S3 privacy and expiry, worker durability, concurrency, backup/restore).
- `npx playwright test tests/e2e/security.spec.ts` — HTTP-level checks (headers, CORS, every case tab, file links,
  portal isolation, rate limit with forged `X-Forwarded-For`).
These reduce, but do not replace, an independent test.

## Reporting
Send findings to the incident lead (INCIDENT-RESPONSE §8) with reproduction steps. Critical findings block launch.
