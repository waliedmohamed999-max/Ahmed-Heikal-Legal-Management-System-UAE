import { test, expect } from "@playwright/test";
import { db, login, PASSWORD } from "./helpers";

test.afterAll(async () => db.$disconnect());

test.describe("authentication", () => {
  test("unauthenticated users are sent to login; APIs return 401", async ({ page, request }) => {
    await page.goto("/app/cases");
    await expect(page).toHaveURL(/\/login/);
    for (const url of ["/api/search?q=a", "/api/notifications", "/api/audit/export", "/api/reports/export"]) {
      expect((await request.get(url)).status(), url).toBe(401);
    }
  });

  test("wrong password shows a generic error", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "ahmed@demo.ahlegal.test");
    await page.fill("#password", "wrong-password-123");
    await page.click("button[type=submit]");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("owner logs in and lands on the Command Center with the next-hearing bar", async ({ page }) => {
    await login(page, "ahmed@demo.ahlegal.test");
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator("header").getByText(/AH-\d{4}-\d{5}/).first()).toBeVisible();
  });

  test("session cookie is httpOnly and not readable from JavaScript", async ({ page }) => {
    await login(page, "ahmed@demo.ahlegal.test");
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "ahl_s")?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain("ahl_s");
    // Nothing sensitive in web storage.
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    expect(stored).not.toMatch(/ahl_s|password|token/i);
  });
});

test.describe("permissions", () => {
  test("a lawyer cannot open a highly confidential case she is not on — and its number is not disclosed", async ({ page }) => {
    const hc = await db.matter.findFirstOrThrow({ where: { confidentiality: "HIGHLY_CONFIDENTIAL", members: { none: { user: { email: "sara@demo.ahlegal.test" } } } } });
    await login(page, "sara@demo.ahlegal.test");
    await page.goto(`/app/cases/${hc.id}`);
    await expect(page.getByRole("heading", { name: /Restricted matter|قضية مقيدة|مقيد/ })).toBeVisible();
    await expect(page.getByText(hc.internalNumber)).toHaveCount(0);
    await expect(page.getByText(hc.title)).toHaveCount(0);
    // Not in her case list or search either.
    await page.goto("/app/cases");
    await expect(page.getByText(hc.internalNumber)).toHaveCount(0);
    const res = await page.request.get(`/api/search?q=${encodeURIComponent(hc.internalNumber)}`);
    expect(await res.text()).not.toContain(hc.id);
  });

  test("admin areas are hidden from a lawyer", async ({ page }) => {
    await login(page, "sara@demo.ahlegal.test");
    for (const p of ["/app/settings/users", "/app/audit", "/app/website"]) {
      const r = await page.goto(p);
      expect(r?.status(), p).toBe(404);
    }
    expect((await page.request.get("/api/audit/export")).status()).toBe(403);
  });

  test("tampered signed file links are rejected", async ({ page }) => {
    const v = await db.documentVersion.findFirstOrThrow({ where: { document: { matter: { members: { some: { user: { email: "ahmed@demo.ahlegal.test" } } } } } } });
    await login(page, "ahmed@demo.ahlegal.test");
    const r = await page.request.get(`/api/files/${v.id}?exp=${Date.now() + 60_000}&sig=deadbeef`);
    expect(r.status()).toBe(403);
  });
});

test.describe("client portal", () => {
  test("client sees only their own shared matters and cannot reach the internal app", async ({ page }) => {
    const client = await db.user.findFirstOrThrow({ where: { email: "client@demo.ahlegal.test" }, include: { client: { include: { matters: true } } } });
    const others = await db.matter.findMany({ where: { clientId: { not: client.clientId! } }, select: { internalNumber: true } });
    await login(page, "client@demo.ahlegal.test", true);
    const body = await page.locator("main").innerText();
    for (const o of others) expect(body).not.toContain(o.internalNumber);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.get("/api/search?q=a")).status()).toBe(401);
  });

  test("a staff account cannot sign in to the portal", async ({ page }) => {
    await page.goto("/portal/login");
    await page.fill("#email", "ahmed@demo.ahlegal.test");
    await page.fill("#password", PASSWORD);
    await page.click("button[type=submit]");
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
