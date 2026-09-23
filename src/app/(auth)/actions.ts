"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { login, logout, verifyMfa } from "@/server/auth/login";
import { getStaffContext } from "@/server/auth/session";
import { db } from "@/server/db";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

export type FormState = { error?: string } | undefined;

const creds = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) });

/** Only allow same-origin relative redirects after login (no open redirect). */
function safeNext(v: FormDataEntryValue | null, fallback: string) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") ? s : fallback;
}

export async function staffLoginAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = creds.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "invalid" };
  const res = await login(parsed.data.email, parsed.data.password, "STAFF");
  if (!res.ok) return { error: res.error };
  redirect(res.mfa ? "/login/mfa" : safeNext(form.get("next"), "/app"));
}

export async function portalLoginAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = creds.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "invalid" };
  const res = await login(parsed.data.email, parsed.data.password, "CLIENT");
  if (!res.ok) return { error: res.error };
  redirect("/portal");
}

export async function mfaAction(_: FormState, form: FormData): Promise<FormState> {
  const code = String(form.get("code") ?? "");
  if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) return { error: "mfaInvalid" };
  const ok = await verifyMfa(code);
  if (!ok) return { error: "mfaInvalid" };
  redirect("/app");
}

export async function logoutAction() {
  await logout("STAFF");
  redirect("/login");
}

export async function portalLogoutAction() {
  await logout("CLIENT");
  redirect("/portal/login");
}

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  const ctx = await getStaffContext();
  if (ctx) await db.user.update({ where: { id: ctx.user.id }, data: { locale } });
}
