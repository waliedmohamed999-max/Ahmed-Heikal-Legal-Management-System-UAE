import { config } from "dotenv";

/** Derive the isolated test database URL from DATABASE_URL (same server, `<db>_test`). */
export function testDatabaseUrl() {
  config({ quiet: true });
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set — copy .env.example to .env");
  const url = new URL(base);
  const name = `${url.pathname.slice(1) || "ahlegal"}_test`;
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error("Unexpected database name");
  url.pathname = `/${name}`;
  const admin = new URL(base);
  admin.pathname = "/postgres";
  admin.search = "";
  return { url: url.toString(), name, adminUrl: admin.toString() };
}
