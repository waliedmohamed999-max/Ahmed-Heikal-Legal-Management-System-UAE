// Visual audit / QA screenshots of every main view.
// Usage: node scripts/audit-shots.mjs <set> [devices=desktop,tablet,mobile] [locales=ar,en] [filter]
// Output: docs/screenshots/<set>/<device>/<locale>/<page>.jpg  (set "final" writes to docs/screenshots/<device>/...)
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ quiet: true });
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PW = process.env.DEMO_PASSWORD ?? "Demo-Password-2026";
const [, , set = "before", devArg = "desktop,tablet,mobile", locArg = "ar,en", filter = ""] = process.argv;

const DEVICES = {
  desktop: { width: 1440, height: 900 },
  wide: { width: 1920, height: 1080 },
  laptop: { width: 1366, height: 768 },
  small: { width: 1024, height: 768 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  mobileL: { width: 430, height: 932, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

const db = new PrismaClient();
const m = await db.matter.findFirstOrThrow({ where: { internalNumber: "AH-2026-00001" } });
const client = await db.client.findFirstOrThrow({ where: { clientNumber: "CL-0001" } });
const doc = await db.document.findFirstOrThrow({ where: { matterId: m.id, deletedAt: null } });
const hearing = await db.hearing.findFirst({ where: { matterId: m.id, startsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } });
const lawyer = await db.user.findFirstOrThrow({ where: { email: "mohamed@demo.ahlegal.test" } });
const inv = await db.invoice.findFirstOrThrow({ where: { number: "INV-2026-0002" } });
await db.$disconnect();

const STAFF = [
  ["dashboard", "/app"],
  ["cases", "/app/cases"],
  ["case-overview", `/app/cases/${m.id}`],
  ["case-timeline", `/app/cases/${m.id}/timeline`],
  ["case-hearings", `/app/cases/${m.id}/hearings`],
  ["case-documents", `/app/cases/${m.id}/documents`],
  ["hearing-prepare", hearing ? `/app/hearings/${hearing.id}/prepare` : null],
  ["calendar", "/app/calendar"],
  ["agenda", "/app/agenda"],
  ["deadlines", `/app/cases/${m.id}/deadlines`],
  ["clients", "/app/clients"],
  ["client-profile", `/app/clients/${client.id}`],
  ["documents", "/app/documents"],
  ["document-detail", `/app/documents/${doc.id}`],
  ["my-work", "/app/my-work"],
  ["tasks", "/app/tasks"],
  ["team", "/app/team"],
  ["team-member", `/app/team/${lawyer.id}`],
  ["finance", "/app/finance"],
  ["invoice", `/app/finance/invoices/${inv.id}`],
  ["reports", "/app/reports"],
  ["knowledge", "/app/knowledge"],
  ["templates", "/app/templates"],
  ["ai", "/app/ai"],
  ["approvals", "/app/approvals"],
  ["crm", "/app/crm"],
  ["website-cms", "/app/website"],
  ["settings", "/app/settings"],
  ["settings-roles", "/app/settings/roles"],
  ["audit", "/app/audit"],
  ["integrations", "/app/integrations"],
].filter(([, p]) => p);
const PORTAL = [["portal", "/portal"]];
const SITE = [["site-home", "/"], ["site-services", "/services"], ["site-about", "/about"], ["site-book", "/book"], ["login", "/login"]];

async function login(page, email, portal) {
  await page.goto(`${BASE}${portal ? "/portal/login" : "/login"}`, { waitUntil: "networkidle", timeout: 180000 });
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("login") && u.pathname.startsWith(portal ? "/portal" : "/app"), { timeout: 180000 }),
    page.click("button[type=submit]"),
  ]);
}

const browser = await chromium.launch();
const errors = [];
// Log in once per account and reuse the session (respects the login rate limits).
const states = {};
for (const who of ["ahmed@demo.ahlegal.test", "client@demo.ahlegal.test"]) {
  const c = await browser.newContext();
  const p = await c.newPage();
  await login(p, who, who.startsWith("client@"));
  states[who] = await c.storageState();
  await c.close();
}
for (const dev of devArg.split(",")) {
  for (const loc of locArg.split(",")) {
    const dir = set === "final" ? `docs/screenshots/${dev}/${loc}` : `docs/screenshots/${set}/${dev}/${loc}`;
    mkdirSync(dir, { recursive: true });
    for (const [who, pages] of [["ahmed@demo.ahlegal.test", STAFF], ["client@demo.ahlegal.test", PORTAL], [null, SITE]]) {
      const list = pages.filter(([n]) => !filter || n.includes(filter));
      if (!list.length) continue;
      const ctx = await browser.newContext({ viewport: { width: DEVICES[dev].width, height: DEVICES[dev].height }, ...DEVICES[dev], locale: loc === "ar" ? "ar-AE" : "en-GB", timezoneId: "Asia/Dubai", ...(who ? { storageState: states[who] } : {}) });
      await ctx.addCookies([{ name: "ahl_locale", value: loc, url: BASE }]);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(`${dev}/${loc} ${page.url()}: ${e.message.slice(0, 200)}`));
      for (const [name, path] of list) {
        const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 180000 });
        await page.waitForTimeout(350);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        // Grow the viewport to the page height so sticky sidebars / fixed bars render as on a real screen.
        const h = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.setViewportSize({ width: DEVICES[dev].width, height: Math.min(Math.max(h, DEVICES[dev].height), 7000) });
        await page.waitForTimeout(150);
        await page.screenshot({ path: `${dir}/${name}.jpg`, type: "jpeg", quality: 72 });
        await page.setViewportSize({ width: DEVICES[dev].width, height: DEVICES[dev].height });
        console.log(`${res?.status()} ${dev}/${loc}/${name}${overflow > 1 ? `  ⚠ overflow ${overflow}px` : ""}`);
      }
      await ctx.close();
    }
  }
}
await browser.close();
if (errors.length) console.log("PAGE ERRORS:\n" + [...new Set(errors)].join("\n"));
