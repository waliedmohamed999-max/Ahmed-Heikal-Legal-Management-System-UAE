"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { login, logout, verifyMfa } from "@/server/auth/login";
import { acceptInvitation, requestPasswordReset, resetPassword } from "@/server/auth/account";
import { beginEnrolment, confirmEnrolment } from "@/server/auth/mfa";
import { audit } from "@/server/audit";
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
  // 6-digit TOTP or a 10-character recovery code (xxxxx-xxxxx).
  if (!/^\d{6}$/.test(code.replace(/\s/g, "")) && !/^[0-9a-f]{5}-?[0-9a-f]{5}$/i.test(code.trim())) return { error: "mfaInvalid" };
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

// ─────────────────────────── Forced MFA enrolment (role policy) ───────────────────────────
// These run outside /app because requireStaff() redirects un-enrolled users here.

export async function mfaSetupBeginAction(): Promise<{ secret: string; uri: string } | { error: string }> {
  const ctx = await getStaffContext();
  if (!ctx || !ctx.mfaEnrollmentRequired) return { error: "forbidden" };
  return beginEnrolment(ctx.user.id, ctx.user.email);
}

export async function mfaSetupConfirmAction(code: string): Promise<{ codes: string[] } | { error: string }> {
  const ctx = await getStaffContext();
  if (!ctx || !ctx.mfaEnrollmentRequired) return { error: "forbidden" };
  const codes = await confirmEnrolment(ctx.user.id, code);
  if (!codes) return { error: "mfaInvalid" };
  await db.session.update({ where: { id: ctx.sessionId }, data: { mfaVerified: true } });
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "auth.mfa_enabled", entityType: "User", entityId: ctx.user.id });
  return { codes };
}

// ─────────────────────────── Password reset / invitations ───────────────────────────

const emailOnly = z.object({ email: z.string().trim().email().max(200) });

/** Always the same response whether or not the account exists (no account enumeration). */
export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState & { sent?: boolean }> {
  const parsed = emailOnly.safeParse({ email: form.get("email") });
  if (!parsed.success) return { error: "invalid" };
  const r = await requestPasswordReset(parsed.data.email);
  if (r === "rateLimited") return { error: "rateLimited" };
  return { sent: true };
}

export async function resetPasswordAction(token: string, password: string): Promise<{ ok: true; realm: "STAFF" | "CLIENT" } | { ok: false; error: string }> {
  return resetPassword(token, password);
}

export async function acceptInvitationAction(input: { token: string; name: string; nameAr?: string; password: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  return acceptInvitation(input);
}
