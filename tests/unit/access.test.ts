import { describe, expect, it } from "vitest";
import { matterCapabilities, documentAccess, type Principal, type MatterAccessInput } from "@/lib/access";
import { SYSTEM_ROLES, MATTER_ACTIONS, applyOverrides } from "@/lib/permissions";

const role = (key: string): Principal => {
  const r = SYSTEM_ROLES.find((x) => x.key === key)!;
  return { userId: "u1", kind: "STAFF", scope: r.matterScope as Principal["scope"], permissions: new Set(r.permissions) };
};
const owner = role("owner");
const lawyer = role("lawyer");
const member = (r: "OWNER" | "LEAD" | "ASSIGNED" | "ASSISTANT" | "OBSERVER" | "DOCUMENTS_ONLY", overrides: string[] = [], expiresAt: Date | null = null): MatterAccessInput["membership"] => ({ role: r, overrides, expiresAt });

describe("matter access (RBAC ∩ matter membership)", () => {
  it("owner with ALL scope sees standard matters without membership", () => {
    const caps = matterCapabilities(owner, { confidentiality: "STANDARD" });
    expect(caps.has("matters.view")).toBe(true);
    expect(caps.has("documents.download")).toBe(true);
  });

  it("an ASSIGNED-scope lawyer cannot see a matter they are not on", () => {
    expect(matterCapabilities(lawyer, { confidentiality: "STANDARD" }).size).toBe(0);
  });

  it("an ASSIGNED-scope lawyer sees a matter they are assigned to", () => {
    const caps = matterCapabilities(lawyer, { confidentiality: "STANDARD", membership: member("ASSIGNED") });
    expect(caps.has("matters.view")).toBe(true);
    expect(caps.has("hearings.manage")).toBe(true);
    expect(caps.has("matters.delete")).toBe(false);
  });

  it("HIGHLY_CONFIDENTIAL requires explicit membership — even for the owner role", () => {
    expect(matterCapabilities(owner, { confidentiality: "HIGHLY_CONFIDENTIAL" }).size).toBe(0);
    expect(matterCapabilities(owner, { confidentiality: "HIGHLY_CONFIDENTIAL", membership: member("OWNER") }).has("matters.view")).toBe(true);
  });

  it("expired temporary access grants nothing", () => {
    const past = new Date(Date.now() - 60_000);
    expect(matterCapabilities(lawyer, { confidentiality: "STANDARD", membership: member("ASSIGNED", [], past) }).size).toBe(0);
    const future = new Date(Date.now() + 3600_000);
    expect(matterCapabilities(lawyer, { confidentiality: "STANDARD", membership: member("ASSIGNED", [], future) }).has("matters.view")).toBe(true);
  });

  it("matter capability never exceeds the role permission (intersection)", () => {
    const limited: Principal = { userId: "x", kind: "STAFF", scope: "ASSIGNED", permissions: new Set(["matters.view", "documents.view"]) };
    const caps = matterCapabilities(limited, { confidentiality: "STANDARD", membership: member("OWNER") });
    expect([...caps].sort()).toEqual(["documents.view", "matters.view"]);
  });

  it("negative overrides remove capabilities; unknown overrides are ignored", () => {
    const caps = applyOverrides(["matters.view", "documents.download"], ["-documents.download", "+not.a.permission"]);
    expect(caps.has("documents.download")).toBe(false);
    expect([...caps]).toEqual(["matters.view"]);
  });

  it("DOCUMENTS_ONLY members cannot reach hearings or finance", () => {
    const caps = matterCapabilities(lawyer, { confidentiality: "STANDARD", membership: member("DOCUMENTS_ONLY") });
    expect(caps.has("hearings.view")).toBe(false);
    expect(caps.has("finance.view")).toBe(false);
  });

  it("client principals and deleted matters get nothing", () => {
    expect(matterCapabilities({ ...owner, kind: "CLIENT" }, { confidentiality: "STANDARD", membership: member("OWNER") }).size).toBe(0);
    expect(matterCapabilities(owner, { confidentiality: "STANDARD", deletedAt: new Date() }).size).toBe(0);
  });

  it("every capability is a known matter action", () => {
    for (const a of matterCapabilities(owner, { confidentiality: "STANDARD" })) expect(MATTER_ACTIONS).toContain(a);
  });
});

describe("document access", () => {
  const caps = new Set(["documents.view", "documents.download"] as const);
  it("DENY always wins", () => {
    expect(documentAccess(new Set(caps), { confidentiality: "STANDARD", perms: [{ access: "EDIT" }, { access: "DENY" }] })).toEqual({ view: false, download: false, edit: false });
  });
  it("explicit EDIT grants edit on top of view", () => {
    expect(documentAccess(new Set(caps), { confidentiality: "STANDARD", perms: [{ access: "EDIT" }] }).edit).toBe(true);
  });
  it("no view means no download", () => {
    expect(documentAccess(new Set(["documents.download"] as const), { confidentiality: "STANDARD", perms: [] })).toEqual({ view: false, download: false, edit: false });
  });
});
