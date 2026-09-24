/**
 * Uploads, malware quarantine (real ClamAV), integrity (SHA-256), object storage privacy
 * and URL expiry (real MinIO S3). Uses the EICAR test file — harmless by design.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { db } from "@/server/db";
import { storeUpload, uploadMetaSchema, sniff, sanitizeFileName, updateDocumentMeta, loadDocumentForUser } from "@/server/services/documents";
import { isServable, clamdScan } from "@/server/services/malware";
import { verifyVersionIntegrity } from "@/server/services/integrity";
import { processPendingDocuments } from "@/server/services/documents-processing";
import { portalVersion } from "@/server/services/portal";
import { s3, signedFileUrl, verifyFileSignature } from "@/server/storage";
import { ctxFor, EICAR, PDF, type ClientCtx } from "./helpers";
import type { StaffContext } from "@/server/auth/session";

let owner: StaffContext, omar: StaffContext;
let matterId = "";
const ids: { clean?: string; infected?: string } = {};

beforeAll(async () => {
  [owner, omar] = await Promise.all([ctxFor("ahmed@demo.ahlegal.test"), ctxFor("omar@demo.ahlegal.test")]);
  matterId = (await db.matter.findFirstOrThrow({ where: { organizationId: owner.org.id, deletedAt: null, portalEnabled: true, client: { portalUsers: { some: { email: "client@demo.ahlegal.test" } } } } })).id;
});
afterAll(async () => {
  await db.$disconnect();
});

describe("upload validation", () => {
  it("rejects executables whatever the extension", () => {
    const pe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64)]);
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(64)]);
    for (const [name, buf] of [["invoice.pdf", pe], ["notes.txt", pe], ["data.csv", elf], ["mail.eml", Buffer.from("#!/bin/sh\nrm -rf /\n")]] as const) {
      expect(() => sniff(name, buf)).toThrow(/fileType/);
    }
  });
  it("rejects disguised binaries, mismatched signatures and unknown types", () => {
    expect(() => sniff("a.txt", Buffer.from([0x41, 0x00, 0x42, 0x43, 0x44]))).toThrow(/fileType/);
    expect(() => sniff("a.pdf", Buffer.from("not a pdf at all"))).toThrow(/fileType/);
    expect(() => sniff("a.png", PDF)).toThrow(/fileType/);
    expect(() => sniff("a.exe", PDF)).toThrow(/fileType/);
    expect(() => sniff("a.html", Buffer.from("<script>alert(1)</script>"))).toThrow(/fileType/);
    expect(sniff("contract.pdf", PDF).mime).toBe("application/pdf");
  });
  it("sanitises client file names (paths, control and bidi-override characters)", () => {
    expect(sanitizeFileName("..\\..\\windows\\system32\\evil.pdf")).toBe("evil.pdf");
    expect(sanitizeFileName("invoice‮fdp.exe")).toBe("invoicefdp.exe");
    expect(sanitizeFileName("a\u0000b\u0007c.pdf")).toBe("abc.pdf");
    expect(sanitizeFileName("...hidden.pdf")).toBe("hidden.pdf");
    expect(sanitizeFileName("x".repeat(400) + ".pdf").length).toBeLessThanOrEqual(180);
  });
});

describe("malware scanning (ClamAV)", () => {
  it("clamd reports the EICAR test file as infected and a PDF as clean", async () => {
    expect((await clamdScan(EICAR)).status).toBe("INFECTED");
    expect((await clamdScan(PDF)).status).toBe("CLEAN");
  });

  it("a clean upload is scanned, checksummed and becomes available", async () => {
    const r = await storeUpload(owner, { name: "clean-contract.pdf", buffer: PDF }, uploadMetaSchema.parse({ matterId, category: "CONTRACT", title: "Clean contract" }));
    ids.clean = r.id;
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: r.id } });
    expect(v.scanStatus).toBe("CLEAN");
    expect(v.checksumSha256).toBe(createHash("sha256").update(PDF).digest("hex"));
    expect(v.storageKey).not.toContain("clean-contract"); // random key, not the client file name
    expect(isServable(v)).toBe(true);
  });

  it("an infected upload is quarantined: no download, no portal share, no OCR, admins alerted", async () => {
    const r = await storeUpload(owner, { name: "eicar.txt", buffer: EICAR }, uploadMetaSchema.parse({ matterId, category: "OTHER", title: "EICAR test" }));
    ids.infected = r.id;
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: r.id } });
    expect(v.scanStatus).toBe("INFECTED");
    expect(v.scanDetail).toMatch(/Eicar/i);
    expect(isServable(v)).toBe(false);
    // Sharing to the client portal is refused.
    const doc = await db.document.findUniqueOrThrow({ where: { id: r.id } });
    await expect(updateDocumentMeta(owner, { id: r.id, title: doc.title, description: null, category: doc.category, tags: [], confidentiality: doc.confidentiality, portalShared: true })).rejects.toThrow(/fileQuarantined/);
    // OCR / extraction never parses it.
    await processPendingDocuments(50);
    expect((await db.documentVersion.findUniqueOrThrow({ where: { id: v.id } })).textStatus).toBe("PENDING");
    // Audited and alerted.
    expect(await db.auditLog.count({ where: { action: "document.malware_detected", entityId: r.id } })).toBe(1);
    expect(await db.notification.count({ where: { dedupeKey: `malware:${v.id}` } })).toBeGreaterThan(0);
  });

  it("an infected file already shared to the portal cannot be downloaded by the client", async () => {
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: ids.infected } });
    await db.document.update({ where: { id: ids.infected }, data: { portalShared: true } }); // simulate a share made before scanning
    const client = (await ctxFor("client@demo.ahlegal.test", "CLIENT")) as ClientCtx;
    await expect(portalVersion(client, v.id)).rejects.toThrow(/fileQuarantined/);
    await db.document.update({ where: { id: ids.infected }, data: { portalShared: false } });
  });
});

describe("document integrity (SHA-256)", () => {
  it("detects a stored file that changed outside the application and blocks it", async () => {
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: ids.clean } });
    expect(await verifyVersionIntegrity(v.id)).toBe("OK");
    const file = path.resolve("./storage-test", v.storageKey);
    const original = await readFile(file);
    await writeFile(file, Buffer.concat([original, Buffer.from("tampered")]));
    try {
      expect(await verifyVersionIntegrity(v.id)).toBe("MISMATCH");
      const after = await db.documentVersion.findUniqueOrThrow({ where: { id: v.id } });
      expect(isServable(after)).toBe(false);
      expect(await db.auditLog.count({ where: { action: "document.integrity_failed", entityId: ids.clean } })).toBe(1);
    } finally {
      await writeFile(file, original);
    }
    expect(await verifyVersionIntegrity(v.id)).toBe("OK");
  });
});

describe("object storage (S3-compatible, MinIO)", () => {
  const key = `${randomUUID()}/${randomUUID()}/${randomUUID()}.pdf`;
  const direct = new S3Client({ region: "us-east-1", endpoint: "http://127.0.0.1:9010", forcePathStyle: true, credentials: { accessKeyId: "ahlegal-dev", secretAccessKey: "ahlegal_dev_only_minio" } });

  it("stores objects privately with server-side encryption", async () => {
    await s3.put(key, PDF, "application/pdf");
    const head = await direct.send(new HeadObjectCommand({ Bucket: "ahlegal-documents", Key: key }));
    expect(head.ServerSideEncryption).toBe("AES256");
    // Anonymous access to the object is refused (no public documents).
    const anon = await fetch(`http://127.0.0.1:9010/ahlegal-documents/${key}`);
    expect(anon.status).toBe(403);
    expect(Buffer.compare(await s3.get(key), PDF)).toBe(0);
  });

  it("presigned URLs work, then expire", async () => {
    const url = (await s3.presignedGet(key, { fileName: "contract.pdf", contentType: "application/pdf", disposition: "attachment", ttlSeconds: 2 }))!;
    const ok = await fetch(url);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toContain("attachment");
    await new Promise((r) => setTimeout(r, 3500));
    expect((await fetch(url)).status).toBe(403);
  });

  it("rejects keys that are not random UUID paths (no client names, no traversal)", async () => {
    await expect(s3.put("../../etc/passwd", PDF, "application/pdf")).rejects.toThrow(/storage/);
    await expect(s3.put("client/contract.pdf", PDF, "application/pdf")).rejects.toThrow(/storage/);
  });
});

describe("application signed links", () => {
  it("are bound to user, version and disposition, and expire", async () => {
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: ids.clean } });
    const u = new URL(signedFileUrl(v.id, owner.user.id, "attachment"), "http://x");
    const [exp, sig] = [u.searchParams.get("exp"), u.searchParams.get("sig")];
    expect(verifyFileSignature(v.id, owner.user.id, exp, sig, "attachment")).toBe(true);
    expect(verifyFileSignature(v.id, omar.user.id, exp, sig, "attachment")).toBe(false); // another user
    expect(verifyFileSignature(v.id, owner.user.id, exp, sig, "inline")).toBe(false); // other disposition
    expect(verifyFileSignature(randomUUID(), owner.user.id, exp, sig, "attachment")).toBe(false); // guessed id
    expect(verifyFileSignature(v.id, owner.user.id, String(Math.floor(Date.now() / 1000) - 1), sig, "attachment")).toBe(false); // expired
    expect(verifyFileSignature(v.id, owner.user.id, exp, "deadbeef", "attachment")).toBe(false); // tampered
  });

  it("the permission check still applies behind a valid link", async () => {
    // omar (junior) cannot open a document outside his cases even with a guessed id.
    const hc = await db.document.findFirst({ where: { confidentiality: "HIGHLY_CONFIDENTIAL", matter: { members: { none: { user: { email: "omar@demo.ahlegal.test" } } } } } });
    if (hc) await expect(loadDocumentForUser(omar, hc.id, "download")).rejects.toThrow(/notFound|forbidden/);
  });
});
