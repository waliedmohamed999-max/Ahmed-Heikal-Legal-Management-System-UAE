"use server";

import { getLocale } from "@/i18n/server";
import { requestMeta } from "@/server/request";
import { rateLimit } from "@/server/rate-limit";
import { handleError, toFieldErrors, type ActionResult } from "@/server/action";
import { bookingSchema, createBooking } from "@/server/services/crm";
import { getPublicOrg } from "@/server/services/site";
import { checkFormStamp, verifyBotToken } from "@/server/bot";

/** Public booking endpoint: IP rate limit, honeypot, signed form stamp, optional challenge, explicit consent, strict validation. */
export async function bookAction(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  try {
    const { ip } = await requestMeta();
    if (!(await rateLimit(`booking:${ip ?? "unknown"}`, 5, 3600)).ok) return { ok: false, error: "rateLimited" };
    const parsed = bookingSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "validation", fieldErrors: toFieldErrors(parsed.error) };
    if (parsed.data.website) return { ok: true, data: { ok: true } }; // bot: silently accept, store nothing
    const stamp = checkFormStamp(parsed.data.formStamp);
    if (stamp === "tooFast") return { ok: true, data: { ok: true } }; // filled faster than a person can: store nothing
    if (stamp === "invalid") return { ok: false, error: "formExpired" };
    if (!(await verifyBotToken(parsed.data.botToken, ip))) return { ok: false, error: "botCheck" };
    const org = await getPublicOrg();
    if (!org) return { ok: false, error: "unexpected" };
    await createBooking(org.id, parsed.data, { ip, locale: await getLocale() });
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return handleError(e);
  }
}
