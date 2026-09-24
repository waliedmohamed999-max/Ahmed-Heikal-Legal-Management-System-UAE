import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";

/**
 * Outbound channel adapters. Each reports its real state — NOT_CONFIGURED until
 * credentials exist; nothing pretends to send. Sending happens in the worker
 * (durable delivery queue), never inside a request transaction.
 *
 *  • EMAIL   — SMTP (works with Microsoft 365 / Google Workspace SMTP relay or any
 *              transactional provider). Verified locally against Mailpit.
 *  • SMS     — Twilio REST API. NOT VERIFIED with a live account.
 *  • WHATSAPP— official WhatsApp Business Cloud API, approved templates only.
 *              Never a personal account, WhatsApp Web automation or QR sessions.
 *              NOT VERIFIED with a live account.
 *  • PUSH    — Web Push is not implemented; always NOT_CONFIGURED.
 */
export type Channel = "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP" | "PUSH";
export type DeliveryStatus = "SENT" | "SKIPPED_NOT_CONNECTED" | "FAILED";
export type AdapterState = "CONNECTED" | "NOT_CONFIGURED";

export interface OutboundMessage {
  to: { email?: string | null; phone?: string | null };
  subject: string;
  body: string;
  link?: string | null;
}

interface Adapter {
  provider(): string | null;
  configured(): boolean;
  send(msg: OutboundMessage): Promise<void>;
}

let transport: Transporter | null = null;
function smtp() {
  const c = env();
  transport ??= nodemailer.createTransport({
    host: c.SMTP_HOST,
    port: c.SMTP_PORT,
    secure: c.SMTP_SECURE,
    // Require STARTTLS in production when not using implicit TLS.
    requireTLS: c.NODE_ENV === "production" && !c.SMTP_SECURE,
    auth: c.SMTP_USER ? { user: c.SMTP_USER, pass: c.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

const email: Adapter = {
  provider: () => (env().EMAIL_PROVIDER === "smtp" ? "smtp" : null),
  configured: () => env().EMAIL_PROVIDER === "smtp" && !!env().SMTP_HOST && !!env().SMTP_FROM,
  async send(msg) {
    if (!msg.to.email) throw new Error("recipient has no e-mail address");
    const text = msg.link ? `${msg.body}\n\n${absolute(msg.link)}` : msg.body;
    await smtp().sendMail({ from: env().SMTP_FROM, to: msg.to.email, subject: msg.subject, text });
  },
};

const sms: Adapter = {
  provider: () => (env().SMS_PROVIDER === "twilio" ? "twilio" : null),
  configured: () => env().SMS_PROVIDER === "twilio" && !!env().TWILIO_ACCOUNT_SID && !!env().TWILIO_AUTH_TOKEN && !!env().TWILIO_FROM,
  async send(msg) {
    if (!msg.to.phone) throw new Error("recipient has no phone number");
    const c = env();
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(c.TWILIO_ACCOUNT_SID!)}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${c.TWILIO_ACCOUNT_SID}:${c.TWILIO_AUTH_TOKEN}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: msg.to.phone, From: c.TWILIO_FROM!, Body: `${msg.subject}${msg.link ? " " + absolute(msg.link) : ""}`.slice(0, 1500) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`SMS provider HTTP ${res.status}`);
  },
};

const whatsapp: Adapter = {
  provider: () => (env().WHATSAPP_BUSINESS_PHONE_ID ? "whatsapp-cloud-api" : null),
  configured: () => !!env().WHATSAPP_BUSINESS_PHONE_ID && !!env().WHATSAPP_BUSINESS_TOKEN && !!env().WHATSAPP_TEMPLATE_NAME,
  async send(msg) {
    if (!msg.to.phone) throw new Error("recipient has no phone number");
    const c = env();
    // Business-initiated messages must use a pre-approved template (Meta policy).
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(c.WHATSAPP_BUSINESS_PHONE_ID!)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${c.WHATSAPP_BUSINESS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.to.phone.replace(/[^\d]/g, ""),
        type: "template",
        template: { name: c.WHATSAPP_TEMPLATE_NAME, language: { code: "ar" }, components: [{ type: "body", parameters: [{ type: "text", text: msg.subject.slice(0, 900) }] }] },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`WhatsApp Cloud API HTTP ${res.status}`);
  },
};

const push: Adapter = {
  provider: () => null,
  configured: () => false,
  async send() {
    throw new Error("Web push is not implemented");
  },
};

const absolute = (link: string) => (link.startsWith("http") ? link : `${env().APP_URL}${link}`);

export const ADAPTERS: Record<Exclude<Channel, "IN_APP">, Adapter> = { EMAIL: email, SMS: sms, WHATSAPP: whatsapp, PUSH: push };

export function channelStatus(): Record<Channel, boolean> {
  return { IN_APP: true, EMAIL: email.configured(), SMS: sms.configured(), WHATSAPP: whatsapp.configured(), PUSH: push.configured() };
}

export function channelProvider(channel: Channel): string {
  return channel === "IN_APP" ? "in-app" : (ADAPTERS[channel].provider() ?? "none");
}

export async function deliver(channel: Channel, msg: OutboundMessage): Promise<{ status: DeliveryStatus; error?: string }> {
  if (channel === "IN_APP") return { status: "SENT" };
  const a = ADAPTERS[channel];
  if (!a.configured()) return { status: "SKIPPED_NOT_CONNECTED" };
  try {
    await a.send(msg);
    return { status: "SENT" };
  } catch (e) {
    return { status: "FAILED", error: e instanceof Error ? e.message.slice(0, 300) : "send failed" };
  }
}

/** Direct e-mail for account flows (reset / invitation). Returns false when e-mail is not configured or fails. */
export async function sendAccountEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (!email.configured()) return false;
  try {
    await email.send({ to: { email: to }, subject, body });
    return true;
  } catch {
    return false;
  }
}

/** Connectivity check for the System Health page (SMTP handshake only; no mail sent). */
export async function verifyEmailTransport(): Promise<"CONNECTED" | "NOT_CONFIGURED" | "ERROR"> {
  if (!email.configured()) return "NOT_CONFIGURED";
  try {
    await smtp().verify();
    return "CONNECTED";
  } catch {
    return "ERROR";
  }
}
