/**
 * Production bootstrap: create the first real owner account.
 *
 *   npm run create-owner -- --email owner@example.ae --name "Ahmed Heikal" [--name-ar "أحمد هيكل"]
 *   (in the container: node dist/create-owner.cjs --email … --name …)
 *
 * No password is ever passed on the command line (it would end up in shell history and
 * process listings). The account is created with an unusable random password hash and a
 * one-time "set your password" link (valid 30 minutes) is printed once. The owner role
 * requires MFA, so the first sign-in continues with authenticator enrolment.
 *
 * Refuses to run while demo data exists, and refuses to create a second owner unless
 * --additional is given.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { parseConfig } from "../src/server/config";
import { findDemoData } from "../src/server/boot-checks";
import { hashPassword } from "../src/server/auth/password";
import { issueToken } from "../src/server/auth/tokens";
import { audit } from "../src/server/audit";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cfg = parseConfig(process.env);
  if (!cfg.config) throw new Error(`Invalid configuration:\n  • ${cfg.errors.join("\n  • ")}`);
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
    throw new Error('usage: create-owner --email <address> --name "<full name>" [--name-ar "<arabic name>"] [--additional]');
  }
  const db = new PrismaClient();
  try {
    const demo = await findDemoData(db);
    if (demo.demoOrgs || demo.demoUsers) throw new Error("Demo data present — bootstrap production on a database seeded with `npm run db:seed` (no --demo).");
    const org = await db.organization.findUnique({ where: { slug: cfg.config.PUBLIC_ORG_SLUG } });
    if (!org) throw new Error(`Organisation "${cfg.config.PUBLIC_ORG_SLUG}" not found — run \`npm run db:seed\` (foundation) first.`);
    const role = await db.role.findFirstOrThrow({ where: { organizationId: org.id, key: "owner" } });
    const owners = await db.user.count({ where: { organizationId: org.id, roleId: role.id, deletedAt: null } });
    if (owners > 0 && !process.argv.includes("--additional")) throw new Error("An owner already exists. Use --additional to create another owner.");
    if (await db.user.findUnique({ where: { email } })) throw new Error("A user with this e-mail already exists.");

    // Owners must use MFA (enforced at sign-in by the role policy).
    await db.role.update({ where: { id: role.id }, data: { requireMfa: true } });
    const unusable = await hashPassword(randomBytes(48).toString("base64url"));
    const { user, url } = await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { organizationId: org.id, kind: "STAFF", email, name, nameAr: arg("name-ar") ?? null, roleId: role.id, passwordHash: unusable, locale: "ar", status: "ACTIVE" } });
      const t = await issueToken(tx, { organizationId: org.id, kind: "PASSWORD_RESET", email, userId: user.id });
      await audit({ organizationId: org.id, action: "user.owner_bootstrapped", entityType: "User", entityId: user.id, after: { email } }, tx);
      return { user, url: t.url };
    });
    console.log(`Owner created: ${user.email}`);
    console.log("One-time link to set the password (valid 30 minutes, shown only now):");
    console.log(url);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
