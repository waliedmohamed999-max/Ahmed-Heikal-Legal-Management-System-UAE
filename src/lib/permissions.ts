/**
 * Permission catalog. Keys are "<module>.<action>".
 * The catalog is synced into the Permission table by the seed; roles reference keys.
 * Admins can create custom roles from any subset of this catalog.
 *
 * Isomorphic on purpose (no server-only import): the UI uses the same keys to
 * hide controls, while every server action re-checks them.
 */
export const PERMISSIONS = {
  // Matters / cases
  "matters.view": "View matters the user has access to",
  "matters.create": "Open new matters",
  "matters.edit": "Edit matter details",
  "matters.delete": "Delete (soft) matters",
  "matters.close": "Close / archive matters",
  "matters.manageMembers": "Manage matter team and access",
  "matters.viewConfidential": "Access CONFIDENTIAL matters without explicit membership (never HIGHLY_CONFIDENTIAL)",
  // Clients & contacts
  "clients.view": "View clients",
  "clients.create": "Create clients",
  "clients.edit": "Edit clients",
  "clients.delete": "Delete clients",
  "clients.viewSensitive": "View Emirates ID / passport details",
  "contacts.view": "View contacts",
  "contacts.manage": "Create and edit contacts",
  // Hearings & deadlines
  "hearings.view": "View hearings",
  "hearings.manage": "Create and edit hearings",
  "hearings.report": "Submit hearing reports",
  "deadlines.view": "View deadlines",
  "deadlines.manage": "Create and edit deadlines",
  "deadlines.verify": "Confirm AI / imported legal deadlines",
  // Calendar & appointments
  "calendar.view": "View own calendar",
  "calendar.viewTeam": "View team calendar",
  "appointments.manage": "Create and edit appointments",
  // Tasks
  "tasks.view": "View tasks",
  "tasks.manage": "Create and edit tasks",
  "tasks.assign": "Assign tasks to others",
  // Documents
  "documents.view": "View documents",
  "documents.upload": "Upload documents and new versions",
  "documents.edit": "Edit document metadata",
  "documents.delete": "Delete documents",
  "documents.download": "Download documents",
  "documents.approve": "Approve documents",
  "documents.share": "Share documents with the client portal",
  // Notes & communications
  "notes.view": "View team notes",
  "notes.create": "Write notes",
  "notes.shareClient": "Share notes with the client portal",
  "communications.manage": "Log communications",
  // Finance
  "finance.view": "View financial information",
  "finance.manage": "Create and edit invoices, payments, expenses",
  "finance.approve": "Approve financial items and void invoices",
  "time.track": "Track own time",
  "time.viewAll": "View everyone's time entries",
  // CRM
  "crm.view": "View leads and pipeline",
  "crm.manage": "Manage leads and pipeline",
  // Team & administration
  "team.view": "View team and workload",
  "team.manage": "Invite, edit and suspend users",
  "roles.manage": "Manage roles and permissions",
  "settings.manage": "Manage office settings, jurisdictions, templates",
  "integrations.manage": "Configure integrations",
  "audit.view": "View the audit log",
  "audit.export": "Export the audit log",
  "approvals.view": "View approval center",
  "approvals.decide": "Approve or reject requests",
  "reports.view": "View reports",
  "ai.use": "Use the AI assistant",
  "knowledge.view": "View knowledge base and templates",
  "knowledge.manage": "Manage knowledge base and templates",
  "cms.manage": "Manage the public website",
  "privacy.manage": "Manage privacy requests, retention and breach log",
  "backups.view": "View backup status",
  // Client portal
  "portal.access": "Access the client portal",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

const VIEW_ONLY: PermissionKey[] = [
  "matters.view", "clients.view", "contacts.view", "hearings.view", "deadlines.view",
  "calendar.view", "tasks.view", "documents.view", "notes.view", "knowledge.view",
];

const LAWYER: PermissionKey[] = [
  ...VIEW_ONLY,
  "matters.edit", "contacts.manage", "hearings.manage", "hearings.report",
  "deadlines.manage", "calendar.viewTeam", "appointments.manage", "tasks.manage", "tasks.assign",
  "documents.upload", "documents.edit", "documents.download", "notes.create",
  "communications.manage", "time.track", "ai.use", "approvals.view", "team.view",
];

type RoleDef = {
  key: string;
  name: string;
  nameAr: string;
  matterScope: "ALL" | "ASSIGNED" | "NONE";
  kind?: "CLIENT";
  permissions: PermissionKey[];
};

/** System roles created for every organisation. Admins may add custom roles. */
export const SYSTEM_ROLES: RoleDef[] = [
  { key: "owner", name: "Owner", nameAr: "المالك", matterScope: "ALL", permissions: ALL_PERMISSIONS.filter((p) => p !== "portal.access") },
  {
    key: "managing_partner", name: "Managing Partner", nameAr: "الشريك المدير", matterScope: "ALL",
    permissions: ALL_PERMISSIONS.filter((p) => !["portal.access", "roles.manage", "backups.view"].includes(p)),
  },
  {
    key: "senior_lawyer", name: "Senior Lawyer", nameAr: "محامٍ أول", matterScope: "ALL",
    permissions: [...LAWYER, "matters.create", "matters.close", "matters.manageMembers", "clients.create", "clients.edit",
      "deadlines.verify", "documents.approve", "documents.share", "notes.shareClient", "finance.view", "crm.view",
      "crm.manage", "reports.view", "approvals.decide", "knowledge.manage"],
  },
  { key: "lawyer", name: "Lawyer", nameAr: "محامٍ", matterScope: "ASSIGNED", permissions: [...LAWYER, "deadlines.verify"] },
  {
    key: "junior_lawyer", name: "Junior Lawyer", nameAr: "محامٍ متدرب", matterScope: "ASSIGNED",
    permissions: LAWYER.filter((p) => !["tasks.assign", "approvals.view"].includes(p)),
  },
  {
    key: "legal_assistant", name: "Legal Assistant", nameAr: "مساعد قانوني", matterScope: "ASSIGNED",
    permissions: [...VIEW_ONLY, "documents.upload", "documents.download", "tasks.manage", "notes.create", "calendar.viewTeam", "appointments.manage", "communications.manage"],
  },
  {
    key: "paralegal", name: "Paralegal", nameAr: "باحث قانوني", matterScope: "ASSIGNED",
    permissions: [...VIEW_ONLY, "documents.upload", "documents.download", "tasks.manage", "notes.create", "time.track", "ai.use"],
  },
  {
    key: "secretary", name: "Secretary", nameAr: "سكرتارية", matterScope: "ASSIGNED",
    permissions: ["clients.view", "clients.create", "contacts.view", "contacts.manage", "calendar.view", "calendar.viewTeam",
      "appointments.manage", "crm.view", "crm.manage", "tasks.view", "hearings.view", "matters.view"],
  },
  {
    key: "finance", name: "Finance", nameAr: "المالية", matterScope: "NONE",
    permissions: ["clients.view", "finance.view", "finance.manage", "finance.approve", "time.viewAll", "reports.view", "approvals.view"],
  },
  { key: "read_only", name: "Read Only", nameAr: "اطلاع فقط", matterScope: "ASSIGNED", permissions: VIEW_ONLY },
  { key: "client", name: "Client", nameAr: "عميل", matterScope: "NONE", kind: "CLIENT", permissions: ["portal.access"] },
];

// ─────────────────────────── Matter-level capabilities ───────────────────────

/** Actions that are evaluated against a specific matter (intersection of role + matter membership). */
export const MATTER_ACTIONS = [
  "matters.view", "matters.edit", "matters.delete", "matters.close", "matters.manageMembers",
  "hearings.view", "hearings.manage", "hearings.report",
  "deadlines.view", "deadlines.manage", "deadlines.verify",
  "tasks.view", "tasks.manage", "tasks.assign",
  "documents.view", "documents.upload", "documents.edit", "documents.delete", "documents.download", "documents.approve", "documents.share",
  "notes.view", "notes.create", "notes.shareClient", "communications.manage",
  "finance.view", "finance.manage", "time.track", "ai.use",
] as const satisfies readonly PermissionKey[];

export type MatterAction = (typeof MATTER_ACTIONS)[number];

export type MemberRole = "OWNER" | "LEAD" | "ASSIGNED" | "ASSISTANT" | "OBSERVER" | "DOCUMENTS_ONLY";

const ALL_MATTER = [...MATTER_ACTIONS] as MatterAction[];

/** Default capabilities per matter-team role. Per-member overrides (+x / -x) apply on top. */
export const MEMBER_ROLE_CAPS: Record<MemberRole, MatterAction[]> = {
  OWNER: ALL_MATTER,
  LEAD: ALL_MATTER.filter((a) => a !== "matters.delete"),
  ASSIGNED: [
    "matters.view", "matters.edit", "hearings.view", "hearings.manage", "hearings.report",
    "deadlines.view", "deadlines.manage", "deadlines.verify", "tasks.view", "tasks.manage", "tasks.assign",
    "documents.view", "documents.upload", "documents.edit", "documents.download",
    "notes.view", "notes.create", "communications.manage", "finance.view", "time.track", "ai.use",
  ],
  ASSISTANT: [
    "matters.view", "hearings.view", "deadlines.view", "tasks.view", "tasks.manage",
    "documents.view", "documents.upload", "documents.download", "notes.view", "notes.create",
    "communications.manage", "time.track",
  ],
  OBSERVER: ["matters.view", "hearings.view", "deadlines.view", "tasks.view", "documents.view", "notes.view"],
  DOCUMENTS_ONLY: ["matters.view", "documents.view", "documents.download"],
};

export function applyOverrides(base: Iterable<MatterAction>, overrides: string[]): Set<MatterAction> {
  const caps = new Set(base);
  for (const o of overrides) {
    const key = o.slice(1) as MatterAction;
    if (!(MATTER_ACTIONS as readonly string[]).includes(key)) continue;
    if (o.startsWith("+")) caps.add(key);
    else if (o.startsWith("-")) caps.delete(key);
  }
  return caps;
}
