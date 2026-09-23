/**
 * Pure access-control rules (no I/O) — the single source of truth for matter access.
 * Covered by unit tests in tests/unit/access.test.ts.
 *
 * Effective matter capability = role permission ∩ matter capability
 *   • HIGHLY_CONFIDENTIAL → explicit, unexpired membership only. No role bypasses this.
 *   • CONFIDENTIAL        → membership, or role holds matters.viewConfidential with scope ALL.
 *   • STANDARD            → membership, or role scope ALL.
 */
import { applyOverrides, MATTER_ACTIONS, MEMBER_ROLE_CAPS, type MatterAction, type MemberRole, type PermissionKey } from "./permissions";

export type Scope = "ALL" | "ASSIGNED" | "NONE";
export type ConfidentialityLevel = "STANDARD" | "CONFIDENTIAL" | "HIGHLY_CONFIDENTIAL";

export interface Principal {
  userId: string;
  kind: "STAFF" | "CLIENT";
  scope: Scope;
  permissions: ReadonlySet<string>;
}

export interface MatterAccessInput {
  confidentiality: ConfidentialityLevel;
  deletedAt?: Date | null;
  membership?: { role: MemberRole; overrides: string[]; expiresAt: Date | null } | null;
}

export function isMembershipActive(m: MatterAccessInput["membership"], now = new Date()): boolean {
  return !!m && (m.expiresAt == null || m.expiresAt.getTime() > now.getTime());
}

export function matterCapabilities(p: Principal, matter: MatterAccessInput, now = new Date()): Set<MatterAction> {
  const none = new Set<MatterAction>();
  if (p.kind !== "STAFF" || matter.deletedAt) return none;

  const member = isMembershipActive(matter.membership, now) ? matter.membership! : null;
  let matterCaps: Set<MatterAction>;

  if (member) {
    matterCaps = applyOverrides(MEMBER_ROLE_CAPS[member.role], member.overrides);
  } else {
    if (matter.confidentiality === "HIGHLY_CONFIDENTIAL") return none;
    if (p.scope !== "ALL") return none;
    if (matter.confidentiality === "CONFIDENTIAL" && !p.permissions.has("matters.viewConfidential")) return none;
    matterCaps = new Set(MATTER_ACTIONS);
  }

  const effective = new Set<MatterAction>();
  for (const a of matterCaps) if (p.permissions.has(a)) effective.add(a);
  // Nothing inside a matter is reachable without being able to view it.
  if (!effective.has("matters.view")) return none;
  return effective;
}

export function can(p: Principal, key: PermissionKey): boolean {
  return p.permissions.has(key);
}

/** Documents: matter access first, then per-document overrides (DENY always wins). */
export function documentAccess(
  caps: Set<MatterAction>,
  doc: { confidentiality: ConfidentialityLevel; perms: { access: "VIEW" | "EDIT" | "DENY" }[] },
): { view: boolean; download: boolean; edit: boolean } {
  if (doc.perms.some((x) => x.access === "DENY")) return { view: false, download: false, edit: false };
  const explicitEdit = doc.perms.some((x) => x.access === "EDIT");
  const view = caps.has("documents.view");
  return {
    view,
    download: view && caps.has("documents.download"),
    edit: view && (caps.has("documents.edit") || explicitEdit),
  };
}
