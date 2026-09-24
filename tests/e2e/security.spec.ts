/**
 * HTTP-level security tests against the running app (real routes, headers, cookies).
 * Complements the DB-backed suite in tests/security.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db, login } from "./helpers";

test.afterAll(async () => db.$disconnect());

const TABS = ["", "/timeline", "/hearings", "/deadlines", "/tasks", "/documents", "/notes", "/communications", "/finance", "/team", "/edit"];

test.describe("security headers", () => {
  test("pages get a nonce-based CSP without 'unsafe-inline' for scripts, plus standard headers", async ({ request }) => {
    const res = await request.get("/login");
    const csp = res.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp.split(";").find((d) => d.trim().startsWith("script-src"))).not.toContain("'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    const h = res.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"]).toBeUndefined();
    // A fresh nonce on every request.
    const csp2 = (await request.get("/login")).headers()["content-security-policy"];
    expect(csp2).not.toBe(csp);
  });

  test("health endpoints expose status only — no versions, hosts or secrets", async ({ request }) => {
    const live = await request.get("/health/live");
    expect(await live.json()).toEqual({ status: "ok" });
    const ready = await request.get("/health/ready");
    const body = await ready.text();
    expect(body).toMatch(/"database":"ok"/);
    expect(body).not.toMatch(/mysql:\/\/|password|secret|127\.0\.0\.1|localhost|version/i);
  });
});

test.describe("cross-origin protection (CORS allowlist)", () => {
  test("state-changing API calls from another origin are refused", async ({ page }) => {
    await login(page, "ahmed@demo.ahlegal.test");
    const r = await page.request.post("/api/notifications", { headers: { origin: "https://evil.example" }, data: { action: "readAll" } });
    expect(r.status()).toBe(403);
    expect(r.headers()["access-control-allow-origin"]).toBeUndefined();
    const same = await page.request.post("/api/notifications", { data: { action: "readAll" } });
    expect(same.status()).toBe(200);
  });
});

test.describe("case permissions over HTTP (every tab, not only the overview)", () => {
  test("a lawyer gets the restricted screen on every tab and no case data", async ({ page }) => {
    const hc = await db.matter.findFirstOrThrow({ where: { confidentiality: "HIGHLY_CONFIDENTIAL", members: { none: { user: { email: "sara@demo.ahlegal.test" } } } } });
    await login(page, "sara@demo.ahlegal.test");
    for (const tab of TABS) {
      const res = await page.goto(`/app/cases/${hc.id}${tab}`);
      expect(res?.status(), tab).toBeLessThan(500);
      const html = await page.content();
      expect(html, tab).not.toContain(hc.internalNumber);
      expect(html, tab).not.toContain(hc.title);
    }
  });

  test("API objects of a restricted case are not reachable by id", async ({ page }) => {
    const task = await db.task.findFirst({ where: { matter: { confidentiality: "HIGHLY_CONFIDENTIAL", members: { none: { user: { email: "sara@demo.ahlegal.test" } } } }, deletedAt: null } });
    await login(page, "sara@demo.ahlegal.test");
    if (task) expect((await page.request.get(`/api/tasks/${task.id}`)).status()).toBe(404);
    expect((await page.request.get(`/api/tasks/${randomUUID()}`)).status()).toBe(404);
  });
});

test.describe("document access over HTTP", () => {
  async function fileStatus(req: APIRequestContext, url: string) {
    return (await req.get(url, { maxRedirects: 0 })).status();
  }
  test("forged, expired, cross-user and guessed file links are refused", async ({ page }) => {
    const v = await db.documentVersion.findFirstOrThrow({ where: { scanStatus: { in: ["CLEAN", "NOT_SCANNED"] } } });
    await login(page, "sara@demo.ahlegal.test");
    const exp = Math.floor(Date.now() / 1000) + 120;
    expect(await fileStatus(page.request, `/api/files/${v.id}?d=attachment&exp=${exp}&sig=forged`)).toBe(403);
    expect(await fileStatus(page.request, `/api/files/${v.id}?d=attachment&exp=${Math.floor(Date.now() / 1000) - 5}&sig=x`)).toBe(403);
    expect(await fileStatus(page.request, `/api/files/${v.id}`)).toBe(403);
    expect(await fileStatus(page.request, `/api/files/../../etc/passwd`)).toBeGreaterThanOrEqual(400);
  });
  test("unauthenticated file and portal-file requests are refused", async ({ request }) => {
    const v = await db.documentVersion.findFirstOrThrow();
    expect((await request.get(`/api/files/${v.id}`)).status()).toBe(401);
    expect((await request.get(`/api/portal/files/${v.id}`)).status()).toBe(401);
  });
});

test.describe("client portal isolation over HTTP", () => {
  test("a client cannot download another client's shared document or open internal pages", async ({ page }) => {
    const other = await db.documentVersion.findFirst({ where: { document: { portalShared: true, deletedAt: null, client: { portalUsers: { none: { email: "client@demo.ahlegal.test" } } } } } });
    await login(page, "client@demo.ahlegal.test", true);
    if (other) expect((await page.request.get(`/api/portal/files/${other.id}`, { maxRedirects: 0 })).status()).toBe(404);
    expect((await page.request.get(`/api/portal/files/${randomUUID()}`)).status()).toBe(404);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.get("/api/search?q=AH")).status()).toBe(401);
  });
});

test.describe("rate limiting cannot be bypassed with a forged X-Forwarded-For", () => {
  test("per-account login limit applies whatever the claimed client IP", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `nobody-${randomUUID()}@example.test`;
    const messages: string[] = [];
    for (let i = 0; i < 11; i++) {
      // A different forged client IP on every attempt.
      await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${i + 1}` });
      await page.goto("/login");
      await page.fill("#email", email);
      await page.fill("#password", "wrong-password-123");
      await page.click("button[type=submit]");
      const alert = page.locator("form").getByRole("alert");
      await expect(alert).toBeVisible();
      messages.push((await alert.textContent()) ?? "");
    }
    // Attempts 1–10 fail as "invalid"; the 11th is refused by the per-account limit.
    expect(messages.slice(0, 10).every((m) => !/too many/i.test(m))).toBe(true);
    expect(messages[10]).toMatch(/too many/i);
  });
});
