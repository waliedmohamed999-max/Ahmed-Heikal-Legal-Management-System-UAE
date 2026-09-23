import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";
import { env } from "./env";
import { hmac, safeEqual } from "./crypto";

/**
 * Object storage abstraction. v1 ships the local-disk driver (files live outside
 * the web root and are only ever served through the permission-checked route).
 * The S3 driver is an explicit "requires configuration" stub — never faked.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Promise<{ stream: NodeJS.ReadableStream; size: number }>;
  remove(key: string): Promise<void>;
}

function safePath(root: string, key: string) {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i.test(key)) throw new AppError("storage", 400);
  const p = path.resolve(root, key);
  if (!p.startsWith(path.resolve(root) + path.sep)) throw new AppError("storage", 400);
  return p;
}

const local: StorageDriver = {
  async put(key, data) {
    const p = safePath(env().STORAGE_LOCAL_DIR, key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data, { flag: "wx" }); // never overwrite an existing version
  },
  async get(key) {
    return readFile(safePath(env().STORAGE_LOCAL_DIR, key));
  },
  async stream(key) {
    const p = safePath(env().STORAGE_LOCAL_DIR, key);
    const s = await stat(p);
    return { stream: createReadStream(p), size: s.size };
  },
  async remove(key) {
    await unlink(safePath(env().STORAGE_LOCAL_DIR, key)).catch(() => {});
  },
};

const s3Unconfigured: StorageDriver = {
  put: async () => { throw new AppError("storage", 503); },
  get: async () => { throw new AppError("storage", 503); },
  stream: async () => { throw new AppError("storage", 503); },
  remove: async () => { throw new AppError("storage", 503); },
};

export function storage(): StorageDriver {
  return env().STORAGE_DRIVER === "s3" ? s3Unconfigured : local;
}

// ─────────────────────────── Signed URLs ───────────────────────────
const TTL_SEC = 300;

/** Short-lived signed URL bound to a specific user and version. The route still re-checks permissions. */
export function signedFileUrl(versionId: string, userId: string, disposition: "inline" | "attachment" = "inline") {
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const sig = hmac(env().FILE_SIGNING_SECRET, `${versionId}.${userId}.${exp}.${disposition}`);
  return `/api/files/${versionId}?d=${disposition}&exp=${exp}&sig=${sig}`;
}

export function verifyFileSignature(versionId: string, userId: string, exp: string | null, sig: string | null, disposition: string) {
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return safeEqual(hmac(env().FILE_SIGNING_SECRET, `${versionId}.${userId}.${exp}.${disposition}`), sig);
}
