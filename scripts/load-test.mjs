/**
 * Basic HTTP load test (synthetic data only — never production).
 *
 *   BASE_URL=http://127.0.0.1:3200 LOAD_TEST_COOKIE="ahl_s=<token>" CASE_ID=<uuid> \
 *     node scripts/load-test.mjs [durationSeconds=30] [concurrency=10]
 *
 * Hits: login page, dashboard, case list, case details, search API, document list — as an
 * authenticated staff user — and reports throughput, p50/p95/p99 latency and errors per route.
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3200";
const COOKIE = process.env.LOAD_TEST_COOKIE ?? "";
const CASE_ID = process.env.CASE_ID ?? "";
const [duration = 30, concurrency = 10] = process.argv.slice(2).map(Number);

const routes = [
  { name: "login page", path: "/login", auth: false },
  { name: "dashboard", path: "/app" },
  { name: "case list", path: "/app/cases" },
  { name: "case list p200", path: "/app/cases?page=200" },
  ...(CASE_ID ? [{ name: "case details", path: `/app/cases/${CASE_ID}` }] : []),
  { name: "search API", path: "/api/search?q=tenancy" },
  { name: "document list", path: "/app/documents" },
  { name: "readiness", path: "/health/ready", auth: false },
];

const stats = new Map(routes.map((r) => [r.name, { ok: 0, err: 0, times: [] }]));
const deadline = Date.now() + duration * 1000;

async function hit(route) {
  const t = performance.now();
  try {
    const res = await fetch(BASE + route.path, { headers: route.auth === false ? {} : { cookie: COOKIE }, redirect: "manual" });
    await res.arrayBuffer();
    const s = stats.get(route.name);
    s.times.push(performance.now() - t);
    // A redirect to /login for an authenticated route means the session did not work — count as error.
    if (res.status >= 200 && res.status < 300) s.ok++;
    else s.err++;
  } catch {
    stats.get(route.name).err++;
  }
}

async function worker(i) {
  let n = i;
  while (Date.now() < deadline) await hit(routes[n++ % routes.length]);
}

const pct = (a, p) => (a.length ? Math.round(a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]) : 0);
const started = Date.now();
await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
const secs = (Date.now() - started) / 1000;
const rows = [...stats].map(([name, s]) => {
  const t = s.times.sort((a, b) => a - b);
  return { route: name, requests: s.ok + s.err, errors: s.err, p50: pct(t, 50), p95: pct(t, 95), p99: pct(t, 99) };
});
const total = rows.reduce((n, r) => n + r.requests, 0);
console.log(JSON.stringify({ base: BASE, durationSeconds: Math.round(secs), concurrency, totalRequests: total, requestsPerSecond: Math.round(total / secs), routes: rows }, null, 2));
