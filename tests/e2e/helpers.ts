import { expect, type Page } from "@playwright/test";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ quiet: true });
export const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-Password-2026";
export const db = new PrismaClient();

// One real form login per account per run: the login rate limit (10/account/15 min)
// is a product requirement, so tests reuse the session instead of loosening it.
const sessions = new Map<string, Awaited<ReturnType<ReturnType<Page["context"]>["cookies"]>>>();

export async function login(page: Page, email: string, portal = false) {
  const key = `${portal ? "portal" : "staff"}:${email}`;
  const cached = sessions.get(key);
  if (cached) {
    await page.context().addCookies(cached);
    await page.goto(portal ? "/portal" : "/app");
    if (!new URL(page.url()).pathname.includes("login")) return;
    sessions.delete(key); // session was revoked — fall through to a real login
  }
  await formLogin(page, email, portal);
  sessions.set(key, await page.context().cookies());
}

async function formLogin(page: Page, email: string, portal: boolean) {
  await page.goto(portal ? "/portal/login" : "/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("login") && u.pathname.startsWith(portal ? "/portal" : "/app")),
    page.click("button[type=submit]"),
  ]);
}

export async function setLocale(page: Page, locale: "ar" | "en") {
  await page.context().addCookies([{ name: "ahl_locale", value: locale, url: page.context().pages()[0]?.url().startsWith("http") ? page.url() : (process.env.BASE_URL ?? "http://localhost:3100") }]);
}

export async function expectNoAppError(page: Page) {
  await expect(page.locator("text=Application error")).toHaveCount(0);
}
