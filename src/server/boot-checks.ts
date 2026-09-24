/**
 * Production start-up checks against the database (no `server-only`: shared with the worker).
 * A production process refuses to start if demo data is present: demo accounts
 * have publicly known passwords.
 */
import { PrismaClient } from "@prisma/client";

const DEMO_EMAIL_DOMAIN = "@demo.ahlegal.test";

export async function findDemoData(db: PrismaClient) {
  const [demoOrgs, demoUsers] = await Promise.all([
    db.organization.count({ where: { isDemo: true } }),
    db.user.count({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN }, deletedAt: null, status: "ACTIVE" } }),
  ]);
  return { demoOrgs, demoUsers };
}

export async function assertNoDemoData() {
  const db = new PrismaClient();
  try {
    const { demoOrgs, demoUsers } = await findDemoData(db);
    if (demoOrgs || demoUsers) {
      throw new Error(`Demo data present (organisations flagged demo: ${demoOrgs}, active demo users: ${demoUsers}). Production must run on a database bootstrapped with SEED_DEMO=false.`);
    }
  } finally {
    await db.$disconnect();
  }
}
