/**
 * MySQL backup / restore-test engine (no `server-only`: used by `scripts/backup.ts`, the
 * worker-less CLI, and integration tests).
 *
 *  Backup:  mysqldump --single-transaction (consistent snapshot, triggers & routines)
 *           → gzip → AES-256-GCM (BACKUP_ENCRYPTION_KEY) → `<name>.sql.gz.enc`
 *           + `<name>.manifest.json` (SHA-256 of the encrypted file, key id, row counts).
 *           Optional off-server copy to an S3-compatible bucket; retention pruning.
 *  Restore: decrypt (current or previous keys) → gunzip → mysql into an ISOLATED database
 *           → validate (row counts vs manifest, critical relationships, integrity
 *           triggers, audit hash chain) → drop the isolated database.
 *
 * The database password never appears on a command line or in logs: native tools read a
 * 0600 `--defaults-extra-file`; the Docker mode passes MYSQL_PWD through the environment.
 */
import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const MAGIC = Buffer.from("AHLBK1");

// ─────────────────────────── Keys ───────────────────────────

export function parseKey(b64: string | undefined): Buffer {
  const k = Buffer.from(b64 ?? "", "base64");
  if (k.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must be a base64 32-byte key");
  return k;
}
/** Non-secret identifier of a key (stored in manifests to pick the right key on restore). */
export const keyId = (key: Buffer) => createHash("sha256").update(key).digest("hex").slice(0, 16);

/** Current key + previous keys (BACKUP_ENCRYPTION_KEYS_PREVIOUS, comma-separated) for rotation. */
export function backupKeys(env = process.env): Buffer[] {
  const current = parseKey(env.BACKUP_ENCRYPTION_KEY);
  const previous = (env.BACKUP_ENCRYPTION_KEYS_PREVIOUS ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(parseKey);
  return [current, ...previous];
}

// ─────────────────────────── Streaming AES-256-GCM ───────────────────────────
// File layout: MAGIC(6) | IV(12) | ciphertext | TAG(16)

export function encryptStream(key: Buffer): Transform {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let started = false;
  return new Transform({
    transform(chunk, _enc, cb) {
      if (!started) {
        this.push(Buffer.concat([MAGIC, iv]));
        started = true;
      }
      cb(null, cipher.update(chunk));
    },
    flush(cb) {
      if (!started) this.push(Buffer.concat([MAGIC, iv]));
      const tail = cipher.final();
      cb(null, Buffer.concat([tail, cipher.getAuthTag()]));
    },
  });
}

/** Decrypt a backup file; throws if the key is wrong or the file was modified (GCM tag). */
export async function decryptFileStream(file: string, key: Buffer): Promise<Readable> {
  const fh = await open(file, "r");
  const { size } = await fh.stat();
  const head = Buffer.alloc(18);
  const tag = Buffer.alloc(16);
  await fh.read(head, 0, 18, 0);
  await fh.read(tag, 0, 16, size - 16);
  await fh.close();
  if (!head.subarray(0, 6).equals(MAGIC)) throw new Error("Not an AH Legal OS backup file");
  const decipher = createDecipheriv("aes-256-gcm", key, head.subarray(6, 18));
  decipher.setAuthTag(tag);
  return createReadStream(file, { start: 18, end: size - 17 }).pipe(decipher);
}

export async function sha256File(file: string) {
  const h = createHash("sha256");
  for await (const c of createReadStream(file)) h.update(c as Buffer);
  return h.digest("hex");
}

// ─────────────────────────── MySQL client tools ───────────────────────────

export type DbTarget = { host: string; port: number; user: string; password: string; database: string };

export function parseMysqlUrl(url: string): DbTarget {
  const u = new URL(url);
  if (u.protocol !== "mysql:") throw new Error("DATABASE_URL must be a mysql:// URL");
  return { host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.replace(/^\//, "") };
}

type Tool = "mysqldump" | "mysql";

/**
 * Spawn mysqldump / mysql without exposing the password:
 *  • MYSQL_DOCKER_CONTAINER set → `docker exec -i -e MYSQL_PWD <container> <tool> …` (the value
 *    is inherited from this process's environment, not passed as an argument);
 *  • otherwise the native binary (MYSQLDUMP_BIN / MYSQL_BIN or PATH) with a temporary
 *    0600 --defaults-extra-file.
 */
export async function spawnTool(tool: Tool, db: DbTarget, args: string[], stdio: { stdin?: boolean } = {}) {
  const container = process.env.MYSQL_DOCKER_CONTAINER;
  let cleanup = async () => {};
  let cmd: string;
  let argv: string[];
  const env = { ...process.env };
  if (container) {
    cmd = "docker";
    // Inside the container the server is reachable on its own loopback.
    argv = ["exec", "-i", "-e", "MYSQL_PWD", container, tool, "-h127.0.0.1", "-P3306", `-u${db.user}`, ...args];
    env.MYSQL_PWD = db.password;
  } else {
    const dir = await mkdtempSecure();
    const cnf = path.join(dir, "client.cnf");
    await writeFile(cnf, `[client]\nhost=${db.host}\nport=${db.port}\nuser=${db.user}\npassword="${db.password.replace(/"/g, '\\"')}"\n`, { mode: 0o600 });
    cleanup = () => rm(dir, { recursive: true, force: true });
    cmd = tool === "mysqldump" ? process.env.MYSQLDUMP_BIN || "mysqldump" : process.env.MYSQL_BIN || "mysql";
    argv = [`--defaults-extra-file=${cnf}`, ...args];
  }
  const child = spawn(cmd, argv, { env, stdio: [stdio.stdin ? "pipe" : "ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr!.on("data", (d) => (stderr += d.toString()));
  const exited = new Promise<void>((resolve, reject) => {
    child.on("error", (e) => reject(new Error(`${tool} not available: ${e.message}`)));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${tool} exited ${code}: ${redactStderr(stderr)}`))));
  }).finally(cleanup);
  return { child, exited };
}

async function mkdtempSecure() {
  const dir = path.join(os.tmpdir(), `ahl-${randomBytes(8).toString("hex")}`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** `<tool> --version` output (no credentials needed). */
async function toolVersion(tool: Tool, db: DbTarget): Promise<string> {
  const container = process.env.MYSQL_DOCKER_CONTAINER;
  const cmd = container ? "docker" : tool === "mysqldump" ? process.env.MYSQLDUMP_BIN || "mysqldump" : process.env.MYSQL_BIN || "mysql";
  const argv = container ? ["exec", container, tool, "--version"] : ["--version"];
  void db;
  return new Promise((resolve) => {
    const c = spawn(cmd, argv, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout!.on("data", (d) => (out += d.toString()));
    c.on("error", () => resolve(""));
    c.on("close", () => resolve(out));
  });
}

const redactStderr = (s: string) => s.replace(/password\S*/gi, "password=[redacted]").slice(0, 400);

/** Run a SQL statement through the mysql client and return tab-separated rows. */
export async function mysqlQuery(db: DbTarget, sql: string, database = db.database): Promise<string[][]> {
  const { child, exited } = await spawnTool("mysql", db, ["-N", "-B", database, "-e", sql]);
  let out = "";
  child.stdout!.on("data", (d) => (out += d.toString()));
  await exited;
  return out.split("\n").filter(Boolean).map((l) => l.split("\t"));
}

// ─────────────────────────── Backup ───────────────────────────

export type Manifest = {
  format: "ahl-mysql-backup/1";
  kind: "DATABASE" | "DOCUMENTS";
  createdAt: string;
  database?: string;
  serverVersion?: string;
  file: string;
  encryptedSha256: string;
  encryptedBytes: number;
  keyId: string;
  rowCounts?: Record<string, number>;
  offsite?: string | null;
};

/** Critical tables whose row counts are recorded at dump time and verified on restore. */
export const CRITICAL_TABLES = ["Organization", "User", "Role", "Client", "Matter", "MatterMember", "Hearing", "Deadline", "Task", "Document", "DocumentVersion", "Invoice", "Payment", "AuditLog", "Reminder", "Notification"];

export async function backupDatabase(opts: { url: string; dir: string; key: Buffer; label?: string }): Promise<Manifest> {
  const db = parseMysqlUrl(opts.url);
  await mkdir(opts.dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `db-${opts.label ?? db.database}-${stamp}`;
  const file = path.join(opts.dir, `${name}.sql.gz.enc`);

  const [version] = await mysqlQuery(db, "SELECT VERSION()");
  // Row counts inside the same logical moment are not guaranteed without a lock; the restore
  // check therefore requires restored >= recorded for append-mostly tables and equality otherwise.
  const rowCounts: Record<string, number> = {};
  for (const t of CRITICAL_TABLES) rowCounts[t] = Number((await mysqlQuery(db, `SELECT COUNT(*) FROM \`${t}\``))[0][0]);

  // Oracle mysqldump needs --set-gtid-purged=OFF for a portable dump; MariaDB's client (Debian's
  // default-mysql-client) does not know the flag.
  const mariaClient = /mariadb/i.test(await toolVersion("mysqldump", db));
  const { child, exited } = await spawnTool("mysqldump", db, [
    "--single-transaction", "--quick", "--routines", "--triggers", "--events", "--hex-blob", "--no-tablespaces",
    ...(mariaClient ? [] : ["--set-gtid-purged=OFF"]), "--default-character-set=utf8mb4", db.database,
  ]);
  const written = pipeline(child.stdout!, createGzip({ level: 6 }), encryptStream(opts.key), createWriteStream(file, { mode: 0o600 }));
  await Promise.all([exited, written]);

  const s = await stat(file);
  const manifest: Manifest = {
    format: "ahl-mysql-backup/1", kind: "DATABASE", createdAt: new Date().toISOString(), database: db.database, serverVersion: version?.[0],
    file: path.basename(file), encryptedSha256: await sha256File(file), encryptedBytes: s.size, keyId: keyId(opts.key), rowCounts, offsite: null,
  };
  await writeFile(path.join(opts.dir, `${name}.manifest.json`), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return manifest;
}

/** Encrypted archive of the local document store (`tar` → gzip → AES-256-GCM). */
export async function backupLocalStorage(opts: { storageDir: string; dir: string; key: Buffer }): Promise<Manifest> {
  await mkdir(opts.dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `docs-${stamp}`;
  const file = path.join(opts.dir, `${name}.tar.gz.enc`);
  const tar = spawn("tar", ["-cf", "-", "-C", path.resolve(opts.storageDir), "."], { stdio: ["ignore", "pipe", "pipe"] });
  const exited = new Promise<void>((res, rej) => { tar.on("error", rej); tar.on("close", (c) => (c === 0 ? res() : rej(new Error(`tar exited ${c}`)))); });
  await Promise.all([exited, pipeline(tar.stdout!, createGzip({ level: 6 }), encryptStream(opts.key), createWriteStream(file, { mode: 0o600 }))]);
  const s = await stat(file);
  const manifest: Manifest = { format: "ahl-mysql-backup/1", kind: "DOCUMENTS", createdAt: new Date().toISOString(), file: path.basename(file), encryptedSha256: await sha256File(file), encryptedBytes: s.size, keyId: keyId(opts.key), offsite: null };
  await writeFile(path.join(opts.dir, `${name}.manifest.json`), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return manifest;
}

// ─────────────────────────── Off-site copy & retention ───────────────────────────

function offsiteClient(env = process.env) {
  if (!env.BACKUP_S3_BUCKET) return null;
  return {
    bucket: env.BACKUP_S3_BUCKET,
    client: new S3Client({
      region: env.BACKUP_S3_REGION || "us-east-1",
      endpoint: env.BACKUP_S3_ENDPOINT || undefined,
      forcePathStyle: !!env.BACKUP_S3_ENDPOINT,
      credentials: env.BACKUP_S3_ACCESS_KEY_ID ? { accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY ?? "" } : undefined,
    }),
  };
}

/** Upload an encrypted backup + manifest to the off-server bucket (already encrypted client-side; SSE on top). */
export async function uploadOffsite(dir: string, m: Manifest): Promise<string | null> {
  const o = offsiteClient();
  if (!o) return null;
  const manifestName = m.file.replace(/\.(sql|tar)\.gz\.enc$/, ".manifest.json");
  for (const f of [m.file, manifestName]) {
    const body = await readFile(path.join(dir, f));
    await o.client.send(new PutObjectCommand({ Bucket: o.bucket, Key: `backups/${f}`, Body: body, ServerSideEncryption: "AES256" }));
  }
  return `s3://${o.bucket}/backups/${m.file}`;
}

/** Delete local and off-site backups older than the retention window. Never touches the newest backup. */
export async function pruneBackups(dir: string, retentionDays: number) {
  const cutoff = Date.now() - retentionDays * 86400_000;
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => /\.(enc|manifest\.json)$/.test(f)).sort();
  const newest = new Set(files.slice(-2));
  let removed = 0;
  for (const f of files) {
    if (newest.has(f)) continue;
    const s = await stat(path.join(dir, f));
    if (s.mtimeMs < cutoff) {
      await unlink(path.join(dir, f));
      removed++;
    }
  }
  const o = offsiteClient();
  if (o) {
    const list = await o.client.send(new ListObjectsV2Command({ Bucket: o.bucket, Prefix: "backups/" }));
    const objs = (list.Contents ?? []).sort((a, b) => +(a.LastModified ?? 0) - +(b.LastModified ?? 0));
    for (const obj of objs.slice(0, Math.max(0, objs.length - 2))) {
      if (obj.LastModified && +obj.LastModified < cutoff) {
        await o.client.send(new DeleteObjectCommand({ Bucket: o.bucket, Key: obj.Key! }));
        removed++;
      }
    }
  }
  return removed;
}

// ─────────────────────────── Restore test ───────────────────────────

export type RestoreReport = {
  ok: boolean;
  backupFile: string;
  isolatedDatabase: string;
  checksumVerified: boolean;
  keyId: string;
  rowCounts: Record<string, { backup: number; restored: number; ok: boolean }>;
  relationships: Record<string, number>;
  triggers: number;
  auditChain: { ok: boolean; checked: number } | null;
  errors: string[];
  durationMs: number;
};

/** Relationship checks: every count must be 0 (orphans). */
const ORPHAN_QUERIES: Record<string, string> = {
  matterWithoutClient: "SELECT COUNT(*) FROM `Matter` m LEFT JOIN `Client` c ON c.id = m.clientId WHERE c.id IS NULL",
  versionWithoutDocument: "SELECT COUNT(*) FROM `DocumentVersion` v LEFT JOIN `Document` d ON d.id = v.documentId WHERE d.id IS NULL",
  hearingWithoutMatter: "SELECT COUNT(*) FROM `Hearing` h LEFT JOIN `Matter` m ON m.id = h.matterId WHERE m.id IS NULL",
  paymentWithoutInvoice: "SELECT COUNT(*) FROM `Payment` p LEFT JOIN `Invoice` i ON i.id = p.invoiceId WHERE i.id IS NULL",
  memberWithoutUser: "SELECT COUNT(*) FROM `MatterMember` mm LEFT JOIN `User` u ON u.id = mm.userId WHERE u.id IS NULL",
  userWithoutRole: "SELECT COUNT(*) FROM `User` u LEFT JOIN `Role` r ON r.id = u.roleId WHERE r.id IS NULL",
  auditWithoutOrganization: "SELECT COUNT(*) FROM `AuditLog` a LEFT JOIN `Organization` o ON o.id = a.organizationId WHERE o.id IS NULL",
};

export async function restoreTest(opts: {
  url: string;
  dir: string;
  file?: string;
  keys: Buffer[];
  /** Verifies the audit hash chain of every organisation in the isolated database. */
  verifyAuditChain?: (isolatedUrl: string) => Promise<{ ok: boolean; checked: number }>;
  keep?: boolean;
}): Promise<RestoreReport> {
  const started = Date.now();
  const db = parseMysqlUrl(opts.url);
  const files = (await readdir(opts.dir)).filter((f) => f.startsWith("db-") && f.endsWith(".sql.gz.enc")).sort();
  const file = opts.file ?? files.at(-1);
  if (!file) throw new Error(`No database backup found in ${opts.dir}`);
  const manifest = JSON.parse(await readFile(path.join(opts.dir, file.replace(/\.sql\.gz\.enc$/, ".manifest.json")), "utf8")) as Manifest;
  const isolated = `ahlegal_restore_${Date.now()}`;
  const report: RestoreReport = { ok: false, backupFile: file, isolatedDatabase: isolated, checksumVerified: false, keyId: manifest.keyId, rowCounts: {}, relationships: {}, triggers: 0, auditChain: null, errors: [], durationMs: 0 };

  report.checksumVerified = (await sha256File(path.join(opts.dir, file))) === manifest.encryptedSha256;
  if (!report.checksumVerified) report.errors.push("encrypted file SHA-256 does not match the manifest");
  const key = opts.keys.find((k) => keyId(k) === manifest.keyId);
  if (!key) throw new Error(`No key available for backup key id ${manifest.keyId} (set BACKUP_ENCRYPTION_KEYS_PREVIOUS)`);

  await mysqlQuery(db, `CREATE DATABASE \`${isolated}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  try {
    const plain = (await decryptFileStream(path.join(opts.dir, file), key)).pipe(createGunzip());
    const { child, exited } = await spawnTool("mysql", db, ["--default-character-set=utf8mb4", isolated], { stdin: true });
    const buffered = new PassThrough();
    await Promise.all([pipeline(plain, buffered, child.stdin!), exited]);

    for (const t of CRITICAL_TABLES) {
      const restored = Number((await mysqlQuery(db, `SELECT COUNT(*) FROM \`${t}\``, isolated))[0][0]);
      const expected = manifest.rowCounts?.[t] ?? 0;
      const ok = restored >= expected;
      report.rowCounts[t] = { backup: expected, restored, ok };
      if (!ok) report.errors.push(`${t}: ${restored} rows restored, ${expected} expected`);
    }
    for (const [k, sql] of Object.entries(ORPHAN_QUERIES)) {
      const n = Number((await mysqlQuery(db, sql, isolated))[0][0]);
      report.relationships[k] = n;
      if (n) report.errors.push(`${k}: ${n} orphaned rows`);
    }
    report.triggers = Number((await mysqlQuery(db, `SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = '${isolated}'`))[0][0]);
    if (report.triggers < 14) report.errors.push(`only ${report.triggers} integrity triggers restored`);
    if (opts.verifyAuditChain) {
      const u = new URL(opts.url);
      u.pathname = `/${isolated}`;
      report.auditChain = await opts.verifyAuditChain(u.toString());
      if (!report.auditChain.ok) report.errors.push("audit hash chain broken in restored copy");
    }
  } catch (e) {
    report.errors.push(e instanceof Error ? redactStderr(e.message) : "restore failed");
  } finally {
    if (!opts.keep) await mysqlQuery(db, `DROP DATABASE IF EXISTS \`${isolated}\``).catch((e) => report.errors.push(`drop failed: ${e instanceof Error ? e.message : e}`));
  }
  report.ok = report.errors.length === 0 && report.checksumVerified;
  report.durationMs = Date.now() - started;
  return report;
}
