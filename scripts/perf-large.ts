/**
 * Large-data performance test (synthetic data, isolated database — NEVER production).
 *
 *   DATABASE_URL=mysql://…/ahlegal_large npm run perf:large -- seed     # migrate first, then seed volumes
 *   DATABASE_URL=mysql://…/ahlegal_large npm run perf:large -- bench    # time the real service queries
 *
 * Volumes: 10,000 clients · 20,000 matters · 100,000 tasks · 100,000 documents (+ versions, metadata only).
 * Refuses to run unless the database name ends with "_large".
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const url = new URL(process.env.DATABASE_URL ?? "");
if (!/_large$/.test(url.pathname)) {
  console.error("Refusing: DATABASE_URL must point at an isolated database whose name ends with _large");
  process.exit(2);
}
const db = new PrismaClient();
const N = { clients: 10_000, matters: 20_000, tasks: 100_000, documents: 100_000 };
const BATCH = 2_000;
const WORDS = ["contract", "lease", "employment", "supply", "breach", "tenancy", "arbitration", "shareholder", "عقد", "إيجار", "تحكيم", "عمالي", "توريد"];
const pick = <T,>(a: T[], i: number) => a[i % a.length];

async function inBatches(total: number, make: (i: number) => object, insert: (rows: object[]) => Promise<unknown>) {
  for (let i = 0; i < total; i += BATCH) {
    const rows = Array.from({ length: Math.min(BATCH, total - i) }, (_, k) => make(i + k));
    await insert(rows);
  }
}

async function seed() {
  const org = await db.organization.findFirstOrThrow({ where: { slug: "ahmed-heikal" } });
  const users = await db.user.findMany({ where: { organizationId: org.id, kind: "STAFF" }, select: { id: true } });
  if (!users.length) throw new Error("Seed the demo foundation first (npm run db:seed:demo against this database)");
  const clientIds = Array.from({ length: N.clients }, () => randomUUID());
  const matterIds = Array.from({ length: N.matters }, () => randomUUID());
  let t = Date.now();
  await inBatches(N.clients, (i) => ({ id: clientIds[i], organizationId: org.id, clientNumber: `LG-${i}`, type: i % 3 ? "INDIVIDUAL" : "COMPANY", nameEn: `Synthetic Client ${i} ${pick(WORDS, i)}`, nameAr: `عميل تجريبي ${i}` }), (r) => db.client.createMany({ data: r as never }));
  console.log(`clients ${N.clients} in ${Date.now() - t} ms`);
  t = Date.now();
  await inBatches(N.matters, (i) => ({
    id: matterIds[i], organizationId: org.id, clientId: pick(clientIds, i), internalNumber: `AH-LG-${String(i).padStart(6, "0")}`,
    title: `Synthetic matter ${i} — ${pick(WORDS, i)} dispute`, kind: pick(["COURT_CASE", "CONSULTATION", "CONTRACT", "DISPUTE"], i), status: pick(["ACTIVE", "ACTIVE", "PENDING", "CLOSED"], i),
    ownerId: pick(users, i).id, leadLawyerId: pick(users, i + 1).id, lastActivityAt: new Date(Date.now() - (i % 400) * 86400_000),
  }), (r) => db.matter.createMany({ data: r as never }));
  console.log(`matters ${N.matters} in ${Date.now() - t} ms`);
  t = Date.now();
  await inBatches(N.tasks, (i) => ({ organizationId: org.id, matterId: pick(matterIds, i), title: `Task ${i} ${pick(WORDS, i)}`, assigneeId: pick(users, i).id, status: pick(["TODO", "IN_PROGRESS", "DONE", "WAITING"], i), dueAt: new Date(Date.now() + ((i % 60) - 20) * 86400_000) }), (r) => db.task.createMany({ data: r as never }));
  console.log(`tasks ${N.tasks} in ${Date.now() - t} ms`);
  t = Date.now();
  const docIds = Array.from({ length: N.documents }, () => randomUUID());
  await inBatches(N.documents, (i) => ({ id: docIds[i], organizationId: org.id, matterId: pick(matterIds, i), title: `Document ${i} ${pick(WORDS, i)}`, category: "OTHER", status: "DRAFT", tags: [], searchText: `Synthetic extracted text ${i} about ${pick(WORDS, i)} and ${pick(WORDS, i + 3)} obligations.` }), (r) => db.document.createMany({ data: r as never }));
  await inBatches(N.documents, (i) => ({ documentId: docIds[i], version: 1, fileName: `doc-${i}.pdf`, storageKey: `${org.id}/${docIds[i]}/${randomUUID()}.pdf`, mimeType: "application/pdf", sizeBytes: 1000, checksumSha256: "0".repeat(64), scanStatus: "CLEAN" }), (r) => db.documentVersion.createMany({ data: r as never }));
  console.log(`documents + versions ${N.documents} in ${Date.now() - t} ms`);
}

async function bench() {
  // Service modules are imported lazily so `seed` does not need the app runtime.
  const { contextFromSession } = await import("../src/server/auth/context");
  const { listMatters, matterListQuery } = await import("../src/server/services/matters");
  const { globalSearch } = await import("../src/server/services/search");
  const { listDocuments, docListQuery } = await import("../src/server/services/documents");
  const { listTasks, taskListQuery } = await import("../src/server/services/tasks");
  const { commandCenter, teamWorkload, financialSnapshot, nextHearing } = await import("../src/server/services/dashboard");
  const { listClients, clientListQuery } = await import("../src/server/services/clients");
  const ctxFor = async (email: string) => {
    const user = await db.user.findFirstOrThrow({ where: { email } });
    const s = await db.session.create({
      data: { userId: user.id, realm: "STAFF", mfaVerified: true, tokenHash: `perf-${randomUUID()}`, expiresAt: new Date(Date.now() + 3600_000) },
      include: { user: { include: { role: { include: { permissions: { select: { permissionKey: true } } } }, organization: true } } },
    });
    return contextFromSession(s);
  };
  const owner = await ctxFor("ahmed@demo.ahlegal.test");
  const lawyer = await ctxFor("sara@demo.ahlegal.test");
  const counts = { clients: await db.client.count(), matters: await db.matter.count(), tasks: await db.task.count(), documents: await db.document.count() };
  const cases: [string, () => Promise<unknown>][] = [
    ["case list p1 (owner)", () => listMatters(owner, matterListQuery.parse({}))],
    ["case list p400 (owner)", () => listMatters(owner, matterListQuery.parse({ page: "400" }))],
    ["case list search (owner)", () => listMatters(owner, matterListQuery.parse({ q: "arbitration" }))],
    ["case list p1 (assigned lawyer)", () => listMatters(lawyer, matterListQuery.parse({}))],
    ["global search 'tenancy' (owner)", () => globalSearch(owner, "tenancy", "en")],
    ["global search 'إيجار' (owner)", () => globalSearch(owner, "إيجار", "ar")],
    ["global search (assigned lawyer)", () => globalSearch(lawyer, "contract", "en")],
    ["documents list p1", () => listDocuments(owner, docListQuery.parse({}))],
    ["documents FULLTEXT 'obligations shareholder'", () => listDocuments(owner, docListQuery.parse({ q: "obligations shareholder" }))],
    ["tasks list (owner)", () => listTasks(owner, taskListQuery.parse({}))],
    ["dashboard command center (owner)", () => commandCenter(owner)],
    ["dashboard team workload (owner)", () => teamWorkload(owner)],
    ["dashboard finance snapshot (owner)", () => financialSnapshot(owner)],
    ["dashboard next hearing (owner)", () => nextHearing(owner)],
    ["clients list p1 (owner)", () => listClients(owner, clientListQuery.parse({}))],
  ];
  const results: { name: string; p50: number; p95: number; max: number }[] = [];
  for (const [name, fn] of cases) {
    await fn(); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t = performance.now();
      await fn();
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    results.push({ name, p50: Math.round(times[3]), p95: Math.round(times[6]), max: Math.round(times[6]) });
  }
  console.log(JSON.stringify({ counts, results }, null, 2));
}

const cmd = process.argv[2];
(cmd === "seed" ? seed() : cmd === "bench" ? bench() : Promise.reject(new Error("usage: perf:large -- seed | bench")))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
