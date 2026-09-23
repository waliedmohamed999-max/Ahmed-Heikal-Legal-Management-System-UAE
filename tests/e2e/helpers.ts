import { expect, type Page } from "@playwright/test";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ quiet: true });
export const PASSWORD = process.env.DEMO_PASSWORD ?? "Demo-Password-2026";
export const db = new PrismaClient();

export async function login(page: Page, email: string, portal = false) {
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
