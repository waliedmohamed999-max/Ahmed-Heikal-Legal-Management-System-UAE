// Visual QA helper: node scripts/shot.mjs <outDir> <email> <locale> <width> <path> [path...]
// Logs in, captures full-page screenshots and reports console / page errors.
import { chromium } from "@playwright/test";

const [, , outDir, email = "ahmed@demo.ahlegal.test", locale = "en", width = "1440", ...paths] = process.argv;
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 }, locale: locale === "ar" ? "ar-AE" : "en-GB", timezoneId: "Asia/Dubai" });
await ctx.addCookies([{ name: "ahl_locale", value: locale, url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`[console] ${m.text().slice(0, 300)}`));
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message.slice(0, 300)}`));

if (email !== "none") {
  const portal = email.startsWith("client@");
  await page.goto(`${BASE}${portal ? "/portal/login" : "/login"}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.fill("#email", email);
  await page.fill("#password", process.env.PW ?? "Demo-Password-2026");
  await Promise.all([page.waitForURL(portal ? /\/portal/ : /\/app/, { timeout: 120000 }), page.click("button[type=submit]")]);
}
for (const p of paths) {
  const res = await page.goto(`${BASE}${p}`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(400);
  const name = `${outDir}/${p.replace(/[^a-z0-9]+/gi, "_") || "root"}_${locale}_${width}.png`;
  await page.screenshot({ path: name, fullPage: true });
  console.log(`${res?.status()} ${p} -> ${name}`);
}
if (errors.length) console.log("ERRORS:\n" + [...new Set(errors)].join("\n"));
await browser.close();
