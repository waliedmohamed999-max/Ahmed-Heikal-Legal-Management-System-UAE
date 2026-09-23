import "server-only";

/**
 * Outbound channel adapters. Each adapter reports its real configuration state —
 * nothing pretends to send. Unconfigured channels are recorded as
 * SKIPPED_NOT_CONNECTED on the NotificationDelivery row.
 *
 * WhatsApp is only supported via the official WhatsApp Business Cloud API; the
 * platform never logs into a personal WhatsApp account.
 */
export type Channel = "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP" | "PUSH";
export type DeliveryStatus = "SENT" | "SKIPPED_NOT_CONNECTED" | "FAILED";

export interface OutboundMessage {
  to: { email?: string | null; phone?: string | null };
  subject: string;
  body: string;
  link?: string | null;
}

interface Adapter {
  configured(): boolean;
  send(msg: OutboundMessage): Promise<void>;
}

const email: Adapter = {
  configured: () => !!process.env.SMTP_HOST && !!process.env.SMTP_FROM,
  async send() {
    // Transport intentionally not bundled until SMTP / Microsoft 365 / Google is configured.
    throw new Error("Email transport not implemented for the configured provider");
  },
};

const sms: Adapter = {
  configured: () => !!process.env.SMS_PROVIDER,
  async send() {
    throw new Error("SMS provider adapter not configured");
  },
};

const whatsapp: Adapter = {
  configured: () => !!process.env.WHATSAPP_BUSINESS_PHONE_ID && !!process.env.WHATSAPP_BUSINESS_TOKEN,
  async send() {
    throw new Error("WhatsApp Business template messaging not configured");
  },
};

const push: Adapter = {
  configured: () => !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY,
  async send() {
    throw new Error("Web push not configured");
  },
};

const ADAPTERS: Record<Exclude<Channel, "IN_APP">, Adapter> = { EMAIL: email, SMS: sms, WHATSAPP: whatsapp, PUSH: push };

export function channelStatus(): Record<Channel, boolean> {
  return { IN_APP: true, EMAIL: email.configured(), SMS: sms.configured(), WHATSAPP: whatsapp.configured(), PUSH: push.configured() };
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
