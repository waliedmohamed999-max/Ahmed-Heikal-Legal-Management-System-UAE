import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "./errors";
import { env } from "./env";
import { hmac, safeEqual } from "./crypto";

/**
 * Object storage.
 *  • `s3`    — any S3-compatible private bucket (AWS S3, MinIO, …). Every object is
 *              written with server-side encryption (SSE-S3 AES256 or SSE-KMS). Objects
 *              are never public; downloads use short-lived presigned URLs that are only
 *              generated after the application's permission and malware checks.
 *  • `local` — files on disk outside the web root, served only through the
 *              permission-checked route. Development, or production on an encrypted
 *              volume by explicit acknowledgement (STORAGE_LOCAL_ENCRYPTED_VOLUME).
 * Keys are random UUIDs (`org/document/version.ext`) — never the client file name.
 */
export interface StorageDriver {
  readonly kind: "local" | "s3";
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Promise<{ stream: NodeJS.ReadableStream; size: number }>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  /** Presigned GET (s3 only). `null` for drivers that are served through the app. */
  presignedGet(key: string, opts: { fileName: string; contentType: string; disposition: "inline" | "attachment"; ttlSeconds: number }): Promise<string | null>;
  ping(): Promise<boolean>;
}

const KEY_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i;
function assertKey(key: string) {
  if (!KEY_RE.test(key)) throw new AppError("storage", 400);
}

function safePath(root: string, key: string) {
  assertKey(key);
  const p = path.resolve(root, key);
  if (!p.startsWith(path.resolve(root) + path.sep)) throw new AppError("storage", 400);
  return p;
}

const local: StorageDriver = {
  kind: "local",
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
  async exists(key) {
    return stat(safePath(env().STORAGE_LOCAL_DIR, key)).then(() => true, () => false);
  },
  async remove(key) {
    await unlink(safePath(env().STORAGE_LOCAL_DIR, key)).catch(() => {});
  },
  async presignedGet() {
    return null;
  },
  async ping() {
    await mkdir(path.resolve(env().STORAGE_LOCAL_DIR), { recursive: true });
    return true;
  },
};

let s3client: S3Client | null = null;
function client() {
  const c = env();
  s3client ??= new S3Client({
    region: c.S3_REGION,
    endpoint: c.S3_ENDPOINT,
    forcePathStyle: c.S3_FORCE_PATH_STYLE,
    credentials: c.S3_USE_INSTANCE_ROLE ? undefined : { accessKeyId: c.S3_ACCESS_KEY_ID!, secretAccessKey: c.S3_SECRET_ACCESS_KEY! },
  });
  return s3client;
}

function asciiName(fileName: string) {
  return fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
}

export const s3: StorageDriver = {
  kind: "s3",
  async put(key, data, contentType) {
    assertKey(key);
    const c = env();
    await client().send(
      new PutObjectCommand({
        Bucket: c.S3_BUCKET,
        Key: key,
        Body: data,
        ContentType: contentType,
        ServerSideEncryption: c.S3_SSE,
        SSEKMSKeyId: c.S3_SSE === "aws:kms" ? c.S3_KMS_KEY_ID : undefined,
      }),
    );
  },
  async get(key) {
    assertKey(key);
    const r = await client().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  },
  async stream(key) {
    assertKey(key);
    const r = await client().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
    return { stream: r.Body as Readable, size: Number(r.ContentLength ?? 0) };
  },
  async exists(key) {
    assertKey(key);
    try {
      await client().send(new HeadObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
      return true;
    } catch {
      return false;
    }
  },
  async remove(key) {
    assertKey(key);
    await client().send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: key })).catch(() => {});
  },
  async presignedGet(key, opts) {
    assertKey(key);
    const cmd = new GetObjectCommand({
      Bucket: env().S3_BUCKET,
      Key: key,
      ResponseContentType: opts.contentType,
      ResponseContentDisposition: `${opts.disposition}; filename="${asciiName(opts.fileName)}"; filename*=UTF-8''${encodeURIComponent(opts.fileName)}`,
      ResponseCacheControl: "private, no-store",
    });
    return getSignedUrl(client(), cmd, { expiresIn: opts.ttlSeconds });
  },
  async ping() {
    await client().send(new HeadBucketCommand({ Bucket: env().S3_BUCKET }));
    return true;
  },
};

export function storage(): StorageDriver {
  return env().STORAGE_DRIVER === "s3" ? s3 : local;
}

// ─────────────────────────── App-level signed URLs ───────────────────────────
// Links rendered in the UI point at our own route, bound to the user and version and
// valid for a few minutes. The route re-checks permissions on every use and only then
// streams the file or redirects to a presigned object-store URL.

export function signedFileUrl(versionId: string, userId: string, disposition: "inline" | "attachment" = "inline") {
  const exp = Math.floor(Date.now() / 1000) + env().SIGNED_URL_TTL_SECONDS;
  const sig = hmac(env().FILE_SIGNING_SECRET, `${versionId}.${userId}.${exp}.${disposition}`);
  return `/api/files/${versionId}?d=${disposition}&exp=${exp}&sig=${sig}`;
}

export function verifyFileSignature(versionId: string, userId: string, exp: string | null, sig: string | null, disposition: string) {
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return safeEqual(hmac(env().FILE_SIGNING_SECRET, `${versionId}.${userId}.${exp}.${disposition}`), sig);
}
