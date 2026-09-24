import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { contextFromSession, type StaffContext } from "@/server/auth/session";
import { hashPassword } from "@/server/auth/password";

/** Request context for a seeded (synthetic) user, as the app would build it from a session. */
export async function ctxFor(email: string, realm: "STAFF" | "CLIENT" = "STAFF"): Promise<StaffContext> {
  const user = await db.user.findFirstOrThrow({ where: { email } });
  const session = await db.session.create({
    data: { userId: user.id, realm, mfaVerified: true, tokenHash: `test-${randomUUID()}`, expiresAt: new Date(Date.now() + 3600_000) },
    include: { user: { include: { role: { include: { permissions: { select: { permissionKey: true } } } }, organization: true } } },
  });
  return contextFromSession(session);
}

export type ClientCtx = StaffContext & { user: { clientId: string } };

/** Create a second synthetic client with its own portal user and one portal-enabled matter. */
export async function createSecondPortalClient(tag: string) {
  const org = await db.organization.findFirstOrThrow({ where: { slug: "ahmed-heikal" } });
  const role = await db.role.findFirstOrThrow({ where: { organizationId: org.id, key: "client" } });
  const owner = await db.user.findFirstOrThrow({ where: { email: "ahmed@demo.ahlegal.test" } });
  const client = await db.client.create({ data: { organizationId: org.id, clientNumber: `CL-T${tag}`, type: "INDIVIDUAL", nameEn: `Isolation Test Client ${tag}`, email: `iso-${tag}@example.test` } });
  const email = `portal-${tag}@example.test`;
  await db.user.create({ data: { organizationId: org.id, kind: "CLIENT", email, name: `Portal ${tag}`, passwordHash: await hashPassword(`Synthetic-${tag}-Pass-2026`), roleId: role.id, clientId: client.id } });
  const matter = await db.matter.create({
    data: { organizationId: org.id, clientId: client.id, internalNumber: `AH-TEST-${tag}`, title: `Isolation matter ${tag}`, kind: "COURT_CASE", status: "ACTIVE", portalEnabled: true, ownerId: owner.id, leadLawyerId: owner.id },
  });
  return { client, matter, email };
}

// Minimal valid one-page PDF (synthetic content).
export const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

/**
 * The EICAR anti-malware test string — an industry-standard, harmless file that every
 * scanner reports as "infected". It is NOT malware. Assembled at runtime so this source
 * file itself is not flagged by antivirus software.
 */
export const EICAR = Buffer.from(["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join(""), "ascii");
