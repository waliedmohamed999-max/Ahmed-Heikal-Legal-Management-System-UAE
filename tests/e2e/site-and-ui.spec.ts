import { test, expect } from "@playwright/test";
import { db, login } from "./helpers";

test.afterAll(async () => db.$disconnect());

test.describe("bilingual UI", () => {
  test("Arabic is RTL and English is LTR", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "ahl_locale", value: "ar", url: baseURL! }]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await context.addCookies([{ name: "ahl_locale", value: "en", url: baseURL! }]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("security headers are set", async ({ request }) => {
    const r = await request.get("/login");
    const h = r.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBeTruthy();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
  });

  test("robots keep the private app out of search engines", async ({ request }) => {
    const txt = await (await request.get("/robots.txt")).text();
    for (const p of ["/app", "/portal", "/api"]) expect(txt).toContain(`Disallow: ${p}`);
  });
});

test.describe("public website", () => {
  test("home, services and booking render without errors @mobile", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const p of ["/", "/services", "/insights", "/about", "/contact", "/book"]) {
      const r = await page.goto(p);
      expect(r?.status(), p).toBe(200);
    }
    // No horizontal scroll on phones.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("booking request is validated and lands in the CRM as a lead", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "ahl_locale", value: "en", url: baseURL! }]);
    await page.goto("/book");
    // Step 1 (service & time) → step 2 (details)
    await page.getByRole("button", { name: /Continue/i }).click();
    await page.getByRole("button", { name: /Send request|Request/i }).click();
    await expect(page.locator("[aria-invalid=true]").first()).toBeVisible();
    const name = `E2E Visitor ${Date.now()}`;
    await page.getByLabel(/Full name|Name/i).first().fill(name);
    await page.getByLabel(/Email/i).first().fill("visitor@example.test");
    await page.getByLabel(/Phone/i).first().fill("+971500000000");
    await page.getByLabel(/message|details|describe/i).first().fill("Synthetic E2E booking request — please ignore.");
    const consent = page.getByRole("checkbox").first();
    if (await consent.count()) await consent.check();
    // The form rejects submissions faster than a person can fill it (signed render stamp).
    await page.waitForTimeout(3_500);
    await page.getByRole("button", { name: /Send request|Request/i }).click();
    // First use in dev compiles the server action, so allow for that before checking the CRM.
    await expect(page.getByText(/request was received/i)).toBeVisible({ timeout: 110_000 });
    expect(await db.lead.count({ where: { name, source: "WEBSITE" } })).toBe(1);
    expect(await db.appointment.count({ where: { lead: { name }, status: "REQUESTED" } })).toBe(1);
  });
});

test.describe("staff pages render", () => {
  test("key modules load for the owner without runtime errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await login(page, "ahmed@demo.ahlegal.test");
    for (const p of ["/app/cases", "/app/clients", "/app/calendar", "/app/documents", "/app/my-work", "/app/approvals", "/app/finance", "/app/crm", "/app/reports", "/app/knowledge", "/app/templates", "/app/integrations/import", "/app/audit", "/app/settings"]) {
      const r = await page.goto(p);
      expect(r?.status(), p).toBe(200);
    }
    expect(errors).toEqual([]);
  });

  test("mobile layout of the Command Center has no horizontal scroll @mobile", async ({ page }) => {
    await login(page, "ahmed@demo.ahlegal.test");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
