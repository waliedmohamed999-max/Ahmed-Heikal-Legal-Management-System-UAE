# Technical Debt Register

Items are open until they are done **and** verified. Owner and target date are set at triage.

| ID | Title | Severity | Status |
|---|---|---|---|
| TD-001 | Prisma 7 compatibility migration (clears `deepmerge-ts` advisory) | High (build/deploy tooling) | Open |
| TD-002 | Client-portal account provisioning (no supported path outside the demo seed) | High (blocks portal use) | Open — product decision |

---

## TD-001 — Prisma 7 compatibility migration

### Current blocker: `npm audit` reports 3 high findings, all from one advisory

| Package | Version | Advisory | Path |
|---|---|---|---|
| `deepmerge-ts` | 7.1.5 | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx): stack exhaustion when merging recursive object graphs (affects `< 8.0.0`) | `prisma@6.19.3 → @prisma/config@6.19.3 → deepmerge-ts@7.1.5` |
| `@prisma/config` | 6.19.3 | same advisory (via `deepmerge-ts`) | `prisma@6.19.3 → @prisma/config` |
| `prisma` | 6.19.3 | same advisory (via `@prisma/config`) | direct dependency (moved from devDependencies for hosts that install without them) |

It is one vulnerability counted three times, not three separate vulnerabilities.

`npm audit fix --force` would move `prisma` to **6.12.0**. That is a downgrade across seven minor
versions: it gives up the fixes this project relies on, and npm flags it as breaking. **It is not
applied.** The actual fix is a Prisma release whose `@prisma/config` depends on `deepmerge-ts ≥ 8`,
that is the Prisma 7 line.

### Exposure assessment (verified 2026-09-24, Phase 11 finalisation)

| Question | Answer | Evidence |
|---|---|---|
| Runtime production dependency? | **Installed, not loaded.** Since the Hostinger fix, `prisma` (the CLI) is in `dependencies`, because hosts that install without devDependencies must still run `prisma generate`, `migrate deploy`, the seed and `create-owner`. The running app uses `@prisma/client` only, which does not load `@prisma/config` or `deepmerge-ts`. | `package.json`; `npm ls deepmerge-ts` |
| Build- or CLI-time only? | **Yes.** It is loaded by the Prisma CLI when it reads `prisma.config.ts` (`generate`, `migrate deploy`, `migrate diff`, seeding). | dependency path above |
| Present on a Hostinger (non-Docker) deployment? | **Yes, on disk** in `node_modules`, and loaded only when the CLI runs (build, migrations, seed). | `package.json` |
| Present in the web/worker/backup image (`runtime` target)? | **No.** The standalone output ships only `node_modules/@prisma/client` and the generated `.prisma` client. The worker, backup and create-owner tools are esbuild bundles that do not include the CLI. | Standalone trace output (`.next/standalone/node_modules/@prisma` contains only `client`). Inspecting the rebuilt image itself is **pending** (Docker unavailable during finalisation). |
| Present in the `migrate` image? | **Yes.** The `migrate` target runs `npx prisma migrate deploy` with full `node_modules`. | `Dockerfile` |
| Reachable by an attacker? | Not from HTTP. The merged input is the project's own `prisma.config.ts` and the CLI defaults, both trusted and repository-controlled. Exploiting it needs control over the config or build inputs, which already means a compromised repository or pipeline. | code reading |

**Reduced exposure, not harmless.** The vulnerable code runs in CI and in the migrate job. A
supply-chain or CI compromise that can shape the config input could crash those steps. The finding
stays open until the dependency is fixed.

Interim controls: the migrate job runs only at deploy time, with its own credentials, and is never
a long-running service. CI runs from the lock file (`npm ci`). `npm audit` stays in CI output so the
advisory remains visible.

Possible interim mitigation (**not applied, not verified**): an npm `overrides` entry forcing
`deepmerge-ts@^8` under `@prisma/config`. It would need the test plan below to prove that
`generate`, `migrate deploy`, `migrate diff` and the seed still behave identically, and it leaves
the project on an unsupported dependency combination.

### Breaking changes expected in Prisma 7

These come from the Prisma 7 announcements. **Confirm each one against the official "Upgrade to
Prisma ORM 7" guide before starting.**

- **Driver adapters are required.** The Rust query engine is gone, so MySQL needs an adapter
  (e.g. `@prisma/adapter-mariadb`, which also targets MySQL). This affects `new PrismaClient()` in
  `src/server/db.ts`, the worker and the CLI scripts.
- **New `prisma-client` generator with an explicit output path.** The client is generated into the
  source tree rather than `node_modules/.prisma`, so imports change from `@prisma/client`. The
  `Dockerfile` line that copies `node_modules/.prisma` and the esbuild bundling in
  `scripts/build-server-tools.mjs` both need changes.
- **Configuration moves to `prisma.config.ts`.** The datasource URL moves there, and the CLI no
  longer loads `.env` automatically.
- **ESM-first packaging and higher minimum Node/TypeScript versions.** The worker and CLI bundles
  are currently CJS.
- **Changed error codes and behaviour under adapters.** `withTxRetry` (deadlock and write-conflict
  retry, `P2034`), the interactive transactions using `SELECT … FOR UPDATE`, and `$queryRaw` typing
  need rechecking.
- **Removed or changed preview features and CLI conveniences.** For example, `migrate dev` may no
  longer run `generate` or the seed implicitly.

### Upgrade prerequisites

1. A staging environment (docs/STAGING-SETUP.md) to rehearse the migrate job.
2. A green baseline on the current version: unit, integration + security, E2E, production build,
   Docker image in all three roles, and the backup restore test.
3. A dedicated branch. No schema changes in the same change set; the Prisma upgrade must not
   change the database schema, and `migrate diff` must stay empty.
4. The official upgrade guide read in full, and the adapter chosen for **MySQL 8.4**.

### Recommended test plan

1. `prisma migrate diff` against a database migrated with the old version must report **no difference**.
2. Fresh migration and upgrade migration on MySQL 8.4 (as in Phase 11), then 24 triggers present.
3. Full suites: `npm test`, `npm run test:security` / integration (79 tests, including
   concurrency: case numbering, payments, MFA replay, invitations), and E2E (27 tests).
4. Transaction behaviour: the concurrency tests must still produce no lost updates or deadlock
   errors, and `withTxRetry` must still catch the adapter's conflict errors.
5. Build `runtime` and `migrate` images; smoke-test web, worker and backup, including
   `backup.cjs all` (restore test) and `create-owner`.
6. Large-data benchmark (`perf:large bench`) and load test with no regression beyond 20 % at p50.
7. `npm audit` must show the `deepmerge-ts` advisory cleared.

---

## TD-002 — Client-portal account provisioning

Portal (client) users are created only by the demo seed. Staff invitations explicitly reject the
`client` role (`src/server/auth/account.ts`). A real office, or a non-demo staging environment,
cannot give a client portal access. Portal isolation is covered by automated tests, but it cannot
be smoke-tested on staging (docs/STAGING-SETUP.md, item 20).

It needs a product decision: invite a portal user from the client page, bound to that client,
with MFA and a one-time link. Phase 11 added no new features, so this was left open deliberately.
