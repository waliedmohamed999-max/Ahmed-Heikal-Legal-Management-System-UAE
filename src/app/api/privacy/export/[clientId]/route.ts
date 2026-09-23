import { NextResponse } from "next/server";
import { staffRoute } from "@/server/api";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { decryptField } from "@/server/crypto";

/** Data-subject export (JSON) for a client. Restricted to privacy.manage and audited. */
export const GET = staffRoute(async (_req, ctx, params) => {
  if (!ctx.can("privacy.manage")) throw new AppError("forbidden", 403);
  const c = await db.client.findFirst({
    where: { id: params.clientId, organizationId: ctx.org.id },
    include: {
      contacts: true,
      matters: { select: { internalNumber: true, officialCaseNumber: true, title: true, status: true, openedAt: true, closedAt: true } },
      appointments: { select: { title: true, startsAt: true, type: true } },
      communications: { select: { channel: true, subject: true, occurredAt: true } },
      invoices: { select: { number: true, total: true, status: true, issueDate: true } },
      documents: { where: { portalShared: true }, select: { title: true, category: true, createdAt: true } },
    },
  });
  if (!c) throw new AppError("notFound", 404);
  await audit({ organizationId: ctx.org.id, actorId: ctx.user.id, sessionId: ctx.sessionId, action: "privacy.data_exported", entityType: "Client", entityId: c.id });
  const { emiratesIdEnc, passportEnc, ...rest } = c;
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), client: { ...rest, emiratesId: decryptField(emiratesIdEnc), passportNo: decryptField(passportEnc) } }, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  return new NextResponse(body, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="client-${c.clientNumber}-export.json"`, "cache-control": "no-store" } });
});
