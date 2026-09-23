/**
 * Seed for AH Legal OS.
 *
 *   npm run db:seed                 → foundation + demo dataset (development)
 *   SEED_DEMO=false npm run db:seed → foundation only (safe for production bootstrap)
 *
 * All demo people, companies, cases and documents are synthetic. The demo
 * organisation is flagged `isDemo`, which shows a banner across the product.
 */
import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { TZDate } from "@date-fns/tz";
import { PERMISSIONS, SYSTEM_ROLES } from "../src/lib/permissions";
import { DEFAULT_REMINDER_OFFSETS, reminderSchedule } from "../src/lib/deadline";

const db = new PrismaClient();
const TZ = "Asia/Dubai";
const SEED_DEMO = process.env.SEED_DEMO !== "false";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo-Password-2026";
const STORAGE_DIR = path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage");

/** Instant `days` from today at hh:mm Dubai time. */
function at(days: number, hh = 9, mm = 0) {
  const now = new TZDate(Date.now(), TZ);
  return new Date(new TZDate(now.getFullYear(), now.getMonth(), now.getDate() + days, hh, mm, 0, TZ).getTime());
}
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000);

// ───────────────────────── Minimal multi-page PDF writer (ASCII text) ─────────────────────────
function simplePdf(pages: string[][]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (m) => "\\" + m);
  const objs: string[] = [];
  const pageIds: number[] = [];
  const fontId = 3;
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let next = 4;
  for (const lines of pages) {
    const content = ["BT", "/F1 11 Tf", "15 TL", "56 790 Td", ...lines.map((l) => `(${esc(l)}) '`), "ET"].join("\n");
    const contentId = next++;
    const pageId = next++;
    objs[contentId] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
    objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageIds.push(pageId);
  }
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(out);
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

// ═══════════════════════════════ Foundation ═══════════════════════════════
async function seedFoundation(orgId: string) {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    const [module, action] = key.split(".");
    await db.permission.upsert({ where: { key }, update: { description, module, action }, create: { key, module, action, description } });
  }
  const roles: Record<string, string> = {};
  for (const [i, r] of SYSTEM_ROLES.entries()) {
    const role = await db.role.upsert({
      where: { organizationId_key: { organizationId: orgId, key: r.key } },
      update: { name: r.name, nameAr: r.nameAr, matterScope: r.matterScope, isSystem: true, rank: i },
      create: { organizationId: orgId, key: r.key, name: r.name, nameAr: r.nameAr, matterScope: r.matterScope, isSystem: true, rank: i },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({ data: r.permissions.map((permissionKey) => ({ roleId: role.id, permissionKey })) });
    roles[r.key] = role.id;
  }

  // Jurisdictions & courts are reference data the admin can edit. No procedural rules are encoded here.
  const J = [
    { code: "FED", name: "Federal Judiciary", nameAr: "القضاء الاتحادي", kind: "FEDERAL" as const, emirate: null },
    { code: "DXB", name: "Dubai Courts", nameAr: "محاكم دبي", kind: "LOCAL" as const, emirate: "Dubai" },
    { code: "AUH", name: "Abu Dhabi Judicial Department", nameAr: "دائرة القضاء – أبوظبي", kind: "LOCAL" as const, emirate: "Abu Dhabi" },
    { code: "RAK", name: "Ras Al Khaimah Courts", nameAr: "محاكم رأس الخيمة", kind: "LOCAL" as const, emirate: "Ras Al Khaimah" },
    { code: "DIFC", name: "DIFC Courts", nameAr: "محاكم مركز دبي المالي العالمي", kind: "FREE_ZONE" as const, emirate: "Dubai" },
    { code: "ADGM", name: "ADGM Courts", nameAr: "محاكم سوق أبوظبي العالمي", kind: "FREE_ZONE" as const, emirate: "Abu Dhabi" },
    { code: "ARB", name: "Arbitration", nameAr: "التحكيم", kind: "ARBITRATION" as const, emirate: null },
  ];
  const jur: Record<string, string> = {};
  for (const j of J) {
    const row = await db.jurisdiction.upsert({
      where: { organizationId_code: { organizationId: orgId, code: j.code } },
      update: {},
      create: { organizationId: orgId, ...j },
    });
    jur[j.code] = row.id;
  }
  const courtCount = await db.court.count({ where: { organizationId: orgId } });
  const courts: Record<string, string> = {};
  if (courtCount === 0) {
    const C = [
      { k: "DXB_FI", j: "DXB", name: "Dubai Courts — Court of First Instance", nameAr: "محاكم دبي — المحكمة الابتدائية", level: "First Instance", emirate: "Dubai" },
      { k: "DXB_AP", j: "DXB", name: "Dubai Courts — Court of Appeal", nameAr: "محاكم دبي — محكمة الاستئناف", level: "Appeal", emirate: "Dubai" },
      { k: "DXB_CS", j: "DXB", name: "Dubai Courts — Court of Cassation", nameAr: "محاكم دبي — محكمة التمييز", level: "Cassation", emirate: "Dubai" },
      { k: "AUH_FI", j: "AUH", name: "Abu Dhabi Court of First Instance", nameAr: "محكمة أبوظبي الابتدائية", level: "First Instance", emirate: "Abu Dhabi" },
      { k: "FED_FI", j: "FED", name: "Federal Court of First Instance", nameAr: "المحكمة الاتحادية الابتدائية", level: "First Instance", emirate: null },
      { k: "RAK_FI", j: "RAK", name: "Ras Al Khaimah Court of First Instance", nameAr: "محكمة رأس الخيمة الابتدائية", level: "First Instance", emirate: "Ras Al Khaimah" },
      { k: "DIFC_FI", j: "DIFC", name: "DIFC Courts — Court of First Instance", nameAr: "محاكم مركز دبي المالي العالمي — المحكمة الابتدائية", level: "First Instance", emirate: "Dubai" },
      { k: "ADGM_FI", j: "ADGM", name: "ADGM Courts — Court of First Instance", nameAr: "محاكم سوق أبوظبي العالمي — المحكمة الابتدائية", level: "First Instance", emirate: "Abu Dhabi" },
      { k: "ARB_TRIB", j: "ARB", name: "Arbitral Tribunal (institution configurable)", nameAr: "هيئة تحكيم (الجهة قابلة للتحديد)", level: null, emirate: null },
    ];
    for (const c of C) {
      const row = await db.court.create({
        data: { organizationId: orgId, jurisdictionId: jur[c.j], name: c.name, nameAr: c.nameAr, level: c.level, emirate: c.emirate },
      });
      courts[c.k] = row.id;
    }
  }

  // Case categories & types (editable)
  const catCount = await db.caseCategory.count({ where: { organizationId: orgId } });
  const types: Record<string, string> = {};
  if (catCount === 0) {
    const cats = [
      { name: "Commercial", nameAr: "تجاري", types: [["COMM_DISPUTE", "Commercial dispute", "نزاع تجاري"], ["DEBT", "Debt collection", "تحصيل ديون"]] },
      { name: "Civil", nameAr: "مدني", types: [["CIVIL", "Civil claim", "دعوى مدنية"]] },
      { name: "Real estate", nameAr: "عقاري", types: [["RE_DISPUTE", "Real estate dispute", "نزاع عقاري"], ["RENTAL", "Rental dispute", "نزاع إيجاري"]] },
      { name: "Labour", nameAr: "عمالي", types: [["LABOUR", "Labour claim", "دعوى عمالية"]] },
      { name: "Advisory", nameAr: "استشارات", types: [["CONTRACT_REVIEW", "Contract review", "مراجعة عقد"], ["LEGAL_OPINION", "Legal opinion", "رأي قانوني"]] },
      { name: "Enforcement", nameAr: "تنفيذ", types: [["EXECUTION", "Execution file", "ملف تنفيذ"]] },
      { name: "Arbitration", nameAr: "تحكيم", types: [["ARBITRATION", "Arbitration", "تحكيم"]] },
    ];
    for (const [i, c] of cats.entries()) {
      const cat = await db.caseCategory.create({ data: { organizationId: orgId, name: c.name, nameAr: c.nameAr, order: i } });
      for (const [code, name, nameAr] of c.types) {
        const t = await db.caseType.create({ data: { organizationId: orgId, categoryId: cat.id, code, name, nameAr } });
        types[code] = t.id;
      }
    }

    // A generic, editable example workflow. Admins must adapt stages to the actual authority.
    const wf = await db.workflow.create({
      data: {
        organizationId: orgId, name: "General litigation (example — edit to match the authority)", nameAr: "تقاضٍ عام (مثال — يُعدّل حسب الجهة)", isDefault: true,
        stages: {
          create: [
            ["INTAKE", "Intake", "الاستلام"], ["PREPARATION", "Preparation", "التحضير"], ["FILED", "Filed", "تم القيد"],
            ["HEARINGS", "Hearings", "الجلسات"], ["EXPERT", "Expert review", "الخبرة"], ["JUDGMENT", "Judgment", "الحكم"],
            ["APPEAL", "Appeal", "الاستئناف"], ["EXECUTION", "Execution", "التنفيذ"], ["CLOSED", "Closed", "مغلقة"],
          ].map(([key, name, nameAr], i) => ({ key, name, nameAr, order: i, isTerminal: key === "CLOSED" })),
        },
      },
    });
    const wf2 = await db.workflow.create({
      data: {
        organizationId: orgId, name: "Advisory matter", nameAr: "ملف استشاري", caseTypeId: types.CONTRACT_REVIEW,
        stages: {
          create: [["RECEIVED", "Received", "مستلم"], ["REVIEW", "Under review", "قيد المراجعة"], ["DELIVERED", "Advice delivered", "تم تقديم الرأي"], ["CLOSED", "Closed", "مغلق"]]
            .map(([key, name, nameAr], i) => ({ key, name, nameAr, order: i, isTerminal: key === "CLOSED" })),
        },
      },
    });
    void wf; void wf2;

    await db.checklistTemplate.create({
      data: {
        organizationId: orgId, caseTypeId: types.COMM_DISPUTE, name: "Commercial dispute — intake checklist", nameAr: "نزاع تجاري — قائمة الاستلام",
        items: {
          create: [
            ["Client documents received", "استلام مستندات العميل", true], ["Power of attorney", "الوكالة", true], ["Contract", "العقد", true],
            ["Invoices", "الفواتير", false], ["Correspondence", "المراسلات", false], ["Evidence", "الأدلة", false],
            ["Legal review", "المراجعة القانونية", true], ["Claim draft", "مسودة صحيفة الدعوى", true], ["Approval", "الاعتماد", true],
            ["Submission", "التقديم", true], ["Fee payment", "سداد الرسوم", true], ["Hearing scheduling", "تحديد الجلسة", false],
          ].map(([title, titleAr, required], i) => ({ title: title as string, titleAr: titleAr as string, required: required as boolean, order: i })),
        },
      },
    });
    await db.checklistTemplate.create({
      data: {
        organizationId: orgId, caseTypeId: types.CONTRACT_REVIEW, name: "Contract review checklist", nameAr: "قائمة مراجعة العقود",
        items: {
          create: [["Engagement letter signed", "توقيع خطاب التعاقد"], ["Draft contract received", "استلام مسودة العقد"], ["Clause review", "مراجعة البنود"], ["Risk memo", "مذكرة المخاطر"], ["Client call", "اتصال مع العميل"]]
            .map(([title, titleAr], i) => ({ title, titleAr, order: i, required: i < 2 })),
        },
      },
    });
  }

  // CRM pipeline stages (editable)
  if ((await db.pipelineStage.count({ where: { organizationId: orgId } })) === 0) {
    const stages = [
      ["New inquiry", "استفسار جديد", "OPEN"], ["Contacted", "تم التواصل", "OPEN"], ["Consultation scheduled", "تم تحديد استشارة", "OPEN"],
      ["Proposal sent", "تم إرسال العرض", "OPEN"], ["Awaiting client", "بانتظار العميل", "OPEN"], ["Converted", "تم التحويل", "WON"], ["Lost", "لم يتم", "LOST"],
    ];
    await db.pipelineStage.createMany({ data: stages.map(([name, nameAr, kind], order) => ({ organizationId: orgId, name, nameAr, kind, order })) });
  }

  // Reminder policies (org-configurable)
  for (const [subjectType, offsets] of Object.entries(DEFAULT_REMINDER_OFFSETS)) {
    await db.reminderPolicy.upsert({
      where: { organizationId_subjectType: { organizationId: orgId, subjectType } },
      update: {},
      create: {
        organizationId: orgId, subjectType, offsetsMinutes: offsets, channels: ["IN_APP", "EMAIL"],
        notifyOwner: subjectType === "HEARING", escalateBeforeMinutes: subjectType === "HEARING" || subjectType === "DEADLINE" ? 1440 : null,
      },
    });
  }

  // Automation templates (rule engine; enabled by default)
  const autos = [
    {
      key: "hearing_created_prep", name: "Hearing created → preparation", nameAr: "إنشاء جلسة ← التحضير", trigger: "hearing.created",
      actions: [
        { type: "create_task", title: "Prepare for hearing", titleAr: "التحضير للجلسة", assignTo: "hearing.attendingLawyer", dueOffsetMinutes: -3 * 1440, priority: "HIGH" },
        { type: "create_task", title: "Prepare hearing brief", titleAr: "إعداد ملخص الجلسة", assignTo: "matter.leadLawyer", dueOffsetMinutes: -1440, priority: "NORMAL" },
      ],
    },
    { key: "document_uploaded_notify", name: "Document uploaded → notify lead lawyer", nameAr: "رفع مستند ← إشعار المحامي الرئيسي", trigger: "document.uploaded", actions: [{ type: "notify", to: "matter.leadLawyer", category: "DOCUMENT" }] },
    {
      key: "matter_closed", name: "Case closed → wrap-up", nameAr: "إغلاق القضية ← الإنهاء", trigger: "matter.closed",
      actions: [
        { type: "cancel_open_tasks" },
        { type: "create_task", title: "Case closure checklist", titleAr: "قائمة إغلاق القضية", assignTo: "matter.leadLawyer", dueOffsetMinutes: 3 * 1440, priority: "NORMAL" },
        { type: "request_approval", kind: "FINANCIAL", title: "Finance review on case closure", titleAr: "مراجعة مالية عند إغلاق القضية", assignTo: "role:finance" },
      ],
    },
  ];
  for (const a of autos) {
    await db.automation.upsert({
      where: { organizationId_key: { organizationId: orgId, key: a.key } },
      update: {},
      create: { organizationId: orgId, key: a.key, name: a.name, nameAr: a.nameAr, trigger: a.trigger, actions: a.actions as Prisma.InputJsonValue },
    });
  }

  // Integrations — real status only. Nothing is shown as connected unless configured.
  const integrations: [string, string, "NOT_CONNECTED" | "REQUIRES_CONFIGURATION" | "UNSUPPORTED", string][] = [
    ["MICROSOFT_365", "EMAIL", "NOT_CONNECTED", "OAuth app registration required"],
    ["GOOGLE_WORKSPACE", "EMAIL", "NOT_CONNECTED", "OAuth client required"],
    ["SMTP", "EMAIL", "REQUIRES_CONFIGURATION", "Set SMTP_* environment variables"],
    ["GOOGLE_CALENDAR", "CALENDAR", "NOT_CONNECTED", "OAuth client required"],
    ["OUTLOOK_CALENDAR", "CALENDAR", "NOT_CONNECTED", "OAuth app registration required"],
    ["S3_STORAGE", "STORAGE", "NOT_CONNECTED", "Local disk storage in use (files are not encrypted by the app — use an encrypted volume or S3 with SSE)"],
    ["SMS", "SMS", "REQUIRES_CONFIGURATION", "Choose a UAE-approved SMS provider"],
    ["WHATSAPP_BUSINESS", "WHATSAPP", "REQUIRES_CONFIGURATION", "Official WhatsApp Business Cloud API only"],
    ["ACCOUNTING", "ACCOUNTING", "NOT_CONNECTED", "Export available; connector not configured"],
    ["AI_PROVIDER", "AI", "REQUIRES_CONFIGURATION", "Set ANTHROPIC_API_KEY and enable AI in Settings"],
    ["OCR", "OCR", "REQUIRES_CONFIGURATION", "PDF/DOCX text extraction active; image OCR provider not configured"],
    ["FEDERAL_JUSTICE_SERVICES", "FEDERAL", "UNSUPPORTED", "No documented public API — use manual import"],
    ["DUBAI_COURTS", "LOCAL_COURTS", "UNSUPPORTED", "No documented public API — use manual import"],
    ["ABU_DHABI_JUDICIAL_DEPARTMENT", "LOCAL_COURTS", "UNSUPPORTED", "No documented public API — use manual import"],
  ];
  for (const [provider, category, status, statusDetail] of integrations) {
    await db.integration.upsert({
      where: { organizationId_provider: { organizationId: orgId, provider } },
      update: { statusDetail }, // keep the informational text accurate on re-seed
      create: { organizationId: orgId, provider, category, status, statusDetail },
    });
  }

  if ((await db.legalResource.count({ where: { organizationId: orgId } })) === 0) {
    const res = [
      ["UAE Legislation (official portal)", "بوابة التشريعات الإماراتية الرسمية", "https://uaelegislation.gov.ae", "LEGISLATION"],
      ["Ministry of Justice", "وزارة العدل", "https://www.moj.gov.ae", "FEDERAL"],
      ["Dubai Courts", "محاكم دبي", "https://www.dc.gov.ae", "LOCAL_COURT"],
      ["Abu Dhabi Judicial Department", "دائرة القضاء – أبوظبي", "https://www.adjd.gov.ae", "LOCAL_COURT"],
      ["DIFC Courts", "محاكم مركز دبي المالي العالمي", "https://www.difccourts.ae", "FREE_ZONE"],
      ["ADGM Courts", "محاكم سوق أبوظبي العالمي", "https://www.adgm.com/adgm-courts", "FREE_ZONE"],
    ];
    await db.legalResource.createMany({
      data: res.map(([title, titleAr, url, category], order) => ({ organizationId: orgId, title, titleAr, url, category, order })),
    });
  }

  // Starter templates — generic wording for the office to review and adapt; placeholders fill from a case.
  if ((await db.template.count({ where: { organizationId: orgId } })) === 0) {
    await db.template.createMany({
      data: [
        {
          organizationId: orgId, kind: "CLIENT_UPDATE", locale: "ar", name: "تحديث العميل بعد الجلسة",
          body: "السيد/ة {{client.name}} المحترم/ة،\n\nتحية طيبة وبعد،\n\nنحيطكم علماً بمستجدات القضية رقم {{matter.number}} ({{matter.title}}) المنظورة أمام {{matter.court}} تحت الرقم {{matter.officialNumber}}.\n\n[ملخص ما تم في الجلسة]\n\nالجلسة القادمة: {{hearing.next}}.\n\nوتفضلوا بقبول فائق الاحترام،\n{{lawyer.name}}\n{{office.nameAr}}\n{{today}}",
        },
        {
          organizationId: orgId, kind: "CLIENT_UPDATE", locale: "en", name: "Client update after hearing",
          body: "Dear {{client.name}},\n\nWe write to update you on matter {{matter.number}} ({{matter.title}}) before {{matter.court}}, case no. {{matter.officialNumber}}.\n\n[Summary of what happened at the hearing]\n\nNext hearing: {{hearing.next}}.\n\nKind regards,\n{{lawyer.name}}\n{{office.name}}\n{{today}}",
        },
        {
          organizationId: orgId, kind: "DOCUMENT_REQUEST", locale: "ar", name: "طلب مستندات من العميل",
          body: "السيد/ة {{client.name}}،\n\nبخصوص القضية {{matter.number}}، نرجو تزويدنا بالمستندات التالية في أقرب وقت ممكن عبر بوابة العملاء:\n\n1. [المستند]\n2. [المستند]\n\nمع الشكر،\n{{lawyer.name}}",
        },
        {
          organizationId: orgId, kind: "ENGAGEMENT_LETTER", locale: "en", name: "Engagement letter (outline)",
          body: "{{today}}\n\n{{client.name}} ({{client.number}})\n\nRe: Engagement — {{matter.title}}\n\n1. Scope of work: [describe]\n2. Fees: [describe]\n3. Responsibilities of the client: [describe]\n4. Confidentiality and data protection: [describe]\n\nThis outline must be reviewed and completed by a lawyer before it is sent.\n\n{{lawyer.name}}\n{{office.name}}",
        },
        {
          organizationId: orgId, kind: "INTERNAL_MEMO", locale: "en", name: "Internal case memo",
          body: "INTERNAL — {{matter.number}}\nMatter: {{matter.title}}\nCourt: {{matter.court}} / {{matter.officialNumber}}\nNext hearing: {{hearing.next}}\n\nIssue:\n\nAnalysis:\n\nRecommended next steps:\n\n— {{lawyer.name}}, {{today}}",
        },
      ],
    });
  }
  if ((await db.knowledgeDocument.count({ where: { organizationId: orgId } })) === 0) {
    await db.knowledgeDocument.createMany({
      data: [
        { organizationId: orgId, kind: "POLICY", locale: "en", title: "Office policy — verifying legal deadlines", tags: ["deadlines", "policy"], body: "Every deadline extracted by AI or imported from a court document is stored as “Needs verification”. A lawyer with the deadlines.verify permission must check the source document and confirm the date before it is relied on. Never calculate a statutory deadline from memory — check the current procedural law and the court’s notice." },
        { organizationId: orgId, kind: "CHECKLIST", locale: "ar", title: "قائمة تحضير الجلسة", tags: ["جلسات", "تحضير"], body: "١. مراجعة آخر قرار في القضية.\n٢. التأكد من إيداع المذكرات في موعدها.\n٣. تجهيز المستندات الأصلية والنسخ.\n٤. تأكيد حضور الموكل أو الوكالة.\n٥. مراجعة ملاحظات الجلسة السابقة." },
        { organizationId: orgId, kind: "LEGAL_NOTE", locale: "en", title: "Sample note — expert reports in commercial disputes", tags: ["expert", "commercial", "sample"], body: "Sample entry (synthetic). Record here the office’s internal practice notes on responding to court-appointed expert reports: timelines set by the court, format of objections, and how to request a supplementary report. Verify against current law before use." },
      ],
    });
  }

  return { roles };
}

// ═══════════════════════════════ Demo data ═══════════════════════════════
async function seedDemo(orgId: string, roles: Record<string, string>) {
  if (await db.matter.count({ where: { organizationId: orgId } })) {
    console.log("• Demo data already present — skipping");
    return;
  }
  const pw = await hash(DEMO_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const mk = (email: string, name: string, nameAr: string, role: string, position: string, positionAr: string) =>
    db.user.create({ data: { organizationId: orgId, email, name, nameAr, roleId: roles[role], position, positionAr, passwordHash: pw, locale: "ar", phone: "+971 50 000 0000" } });

  const ahmed = await mk("ahmed@demo.ahlegal.test", "Ahmed Heikal", "أحمد هيكل", "owner", "Legal Consultant", "المستشار القانوني");
  const mohamed = await mk("mohamed@demo.ahlegal.test", "Mohamed Salem", "محمد سالم", "senior_lawyer", "Senior Lawyer", "محامٍ أول");
  const sara = await mk("sara@demo.ahlegal.test", "Sara Mansour", "سارة منصور", "lawyer", "Lawyer", "محامية");
  const omar = await mk("omar@demo.ahlegal.test", "Omar Khalid", "عمر خالد", "junior_lawyer", "Junior Lawyer", "محامٍ متدرب");
  const layla = await mk("layla@demo.ahlegal.test", "Layla Hassan", "ليلى حسن", "legal_assistant", "Legal Assistant", "مساعدة قانونية");
  await mk("reception@demo.ahlegal.test", "Fatima Noor", "فاطمة نور", "secretary", "Office Coordinator", "منسقة المكتب");
  const finance = await mk("finance@demo.ahlegal.test", "Rashid Ali", "راشد علي", "finance", "Finance Officer", "مسؤول مالي");

  await db.team.create({
    data: { organizationId: orgId, name: "Litigation", nameAr: "التقاضي", members: { create: [ahmed, mohamed, sara, omar, layla].map((u) => ({ userId: u.id })) } },
  });

  const types = Object.fromEntries((await db.caseType.findMany({ where: { organizationId: orgId } })).map((t) => [t.code, t.id]));
  const courtRows = await db.court.findMany({ where: { organizationId: orgId }, include: { jurisdiction: true } });
  const court = (prefix: string) => courtRows.find((c) => c.name.startsWith(prefix))!;
  const stages = await db.workflowStage.findMany({ where: { workflow: { organizationId: orgId, isDefault: true } } });
  const stage = (k: string) => stages.find((s) => s.key === k)?.id;

  // Clients (synthetic)
  const C = [
    { n: "CL-0001", type: "COMPANY", en: "Falcon Ridge Trading LLC", ar: "شركة فالكون ريدج للتجارة ذ.م.م", email: "legal@falconridge.example", src: "REFERRAL" },
    { n: "CL-0002", type: "COMPANY", en: "Desert Bloom Real Estate Development", ar: "ديزرت بلوم للتطوير العقاري", email: "office@desertbloom.example", src: "WEBSITE" },
    { n: "CL-0003", type: "INDIVIDUAL", en: "Youssef Karim", ar: "يوسف كريم", email: "y.karim@mail.example", src: "WEBSITE" },
    { n: "CL-0004", type: "COMPANY", en: "Sahara Tech Solutions DMCC", ar: "صحارى للحلول التقنية م.م.د", email: "contracts@saharatech.example", src: "REFERRAL" },
    { n: "CL-0005", type: "COMPANY", en: "Harbor Line Logistics FZE", ar: "هاربر لاين للخدمات اللوجستية م.م.ح", email: "gc@harborline.example", src: "EXISTING_CLIENT" },
    { n: "CL-0006", type: "INDIVIDUAL", en: "Noura Rahman", ar: "نورة رحمن", email: "noura.r@mail.example", src: "PHONE" },
  ] as const;
  const clients: Record<string, { id: string }> = {};
  for (const c of C) {
    clients[c.n] = await db.client.create({
      data: {
        organizationId: orgId, clientNumber: c.n, type: c.type, nameEn: c.en, nameAr: c.ar, email: c.email, phone: "+971 4 000 0000",
        whatsapp: "+971 50 000 0000", preferredLanguage: c.type === "COMPANY" ? "en" : "ar", source: c.src, createdById: ahmed.id,
        tradeLicenseNo: c.type === "COMPANY" ? "TL-DEMO-" + c.n.slice(-4) : null, nationality: c.type === "INDIVIDUAL" ? "Demo" : null,
        lastContactAt: at(-Math.floor(Math.random() * 20)),
      },
    });
  }

  const opp = async (en: string, ar: string, type: "COMPANY" | "INDIVIDUAL" = "COMPANY") =>
    db.contact.create({ data: { organizationId: orgId, category: "OPPONENT", type, nameEn: en, nameAr: ar } });
  const gulf = await opp("Gulf Horizon Supplies LLC", "شركة جلف هورايزن للتوريدات ذ.م.م");
  const tenant = await opp("Blue Oasis Retail LLC", "شركة الواحة الزرقاء للتجزئة ذ.م.م");
  const employer = await opp("Metro Build Contracting LLC", "شركة مترو بيلد للمقاولات ذ.م.م");
  const carrier = await opp("Oceanic Freight Carriers Ltd", "أوشيانك فريت كاريرز المحدودة");
  const expert = await db.contact.create({ data: { organizationId: orgId, category: "EXPERT", nameEn: "Eng. Tarek Fouad (Accounting Expert)", nameAr: "م. طارق فؤاد (خبير حسابي)", phone: "+971 50 000 0001" } });
  await db.contact.create({ data: { organizationId: orgId, category: "TRANSLATOR", nameEn: "Precise Legal Translation", nameAr: "الدقة للترجمة القانونية", type: "COMPANY" } });
  const clientContact = await db.contact.create({ data: { organizationId: orgId, category: "CLIENT", nameEn: "Hamad Saeed (Falcon Ridge GM)", nameAr: "حمد سعيد (المدير العام)", clientId: clients["CL-0001"].id, email: "gm@falconridge.example" } });
  await db.contactRelation.create({ data: { fromId: clientContact.id, toId: gulf.id, label: "Former supplier contact" } });

  type M = {
    n: number; title: string; titleAr: string; kind: "COURT_CASE" | "CONSULTATION" | "CONTRACT" | "EXECUTION" | "APPEAL" | "ARBITRATION";
    client: string; type: string; court?: string; priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW"; status?: "ACTIVE" | "PENDING" | "CLOSED";
    conf?: "STANDARD" | "CONFIDENTIAL" | "HIGHLY_CONFIDENTIAL"; lead: string; members: [string, "LEAD" | "ASSIGNED" | "ASSISTANT" | "OBSERVER"][];
    official?: string; claim?: number; stage?: string; opponent?: string; summary: string; flags?: string[]; billing?: "FIXED" | "HOURLY" | "RETAINER"; openedDaysAgo: number;
  };
  const M: M[] = [
    { n: 1, title: "Falcon Ridge v. Gulf Horizon — Supply contract breach", titleAr: "فالكون ريدج ضد جلف هورايزن — الإخلال بعقد توريد", kind: "COURT_CASE", client: "CL-0001", type: "COMM_DISPUTE", court: "Dubai Courts — Court of First Instance", priority: "HIGH", lead: mohamed.id, members: [[mohamed.id, "LEAD"], [sara.id, "ASSIGNED"], [omar.id, "ASSISTANT"]], official: "DEMO-1452/2026", claim: 2_450_000, stage: "HEARINGS", opponent: gulf.id, summary: "Claim for unpaid supply invoices and damages following termination of a 2024 supply agreement. Expert accounting review ordered at the first hearing.", flags: ["DEADLINE_APPROACHING"], billing: "RETAINER", openedDaysAgo: 96 },
    { n: 2, title: "Desert Bloom — Commercial lease termination", titleAr: "ديزرت بلوم — إنهاء عقد إيجار تجاري", kind: "COURT_CASE", client: "CL-0002", type: "RENTAL", court: "Dubai Courts — Court of First Instance", priority: "NORMAL", lead: sara.id, members: [[sara.id, "LEAD"], [layla.id, "ASSISTANT"]], official: "DEMO-0877/2026", claim: 380_000, stage: "HEARINGS", opponent: tenant.id, summary: "Eviction and rent arrears claim against a retail tenant for a mall unit.", flags: ["WAITING_CLIENT"], billing: "FIXED", openedDaysAgo: 54 },
    { n: 3, title: "Youssef Karim v. Metro Build — End of service dues", titleAr: "يوسف كريم ضد مترو بيلد — مستحقات نهاية الخدمة", kind: "COURT_CASE", client: "CL-0003", type: "LABOUR", court: "Dubai Courts — Court of First Instance", priority: "NORMAL", lead: sara.id, members: [[sara.id, "LEAD"], [omar.id, "ASSIGNED"]], official: "DEMO-3310/2026", claim: 96_500, stage: "FILED", opponent: employer.id, summary: "Labour claim for unpaid end-of-service gratuity and notice pay.", billing: "FIXED", openedDaysAgo: 30 },
    { n: 4, title: "Sahara Tech — SaaS master services agreement review", titleAr: "صحارى تك — مراجعة اتفاقية الخدمات الرئيسية", kind: "CONTRACT", client: "CL-0004", type: "CONTRACT_REVIEW", priority: "NORMAL", lead: mohamed.id, members: [[mohamed.id, "LEAD"]], summary: "Review and negotiation of an MSA with a regional telecom customer.", billing: "HOURLY", openedDaysAgo: 12 },
    { n: 5, title: "Harbor Line — Cargo loss arbitration", titleAr: "هاربر لاين — تحكيم بشأن فقدان شحنة", kind: "ARBITRATION", client: "CL-0005", type: "ARBITRATION", court: "Arbitral Tribunal", priority: "CRITICAL", conf: "HIGHLY_CONFIDENTIAL", lead: mohamed.id, members: [[mohamed.id, "LEAD"]], claim: 7_800_000, opponent: carrier.id, summary: "Confidential arbitration concerning loss of a high-value container shipment.", flags: ["COURT_ACTION_REQUIRED"], billing: "HOURLY", openedDaysAgo: 140 },
    { n: 6, title: "Falcon Ridge — Enforcement of judgment", titleAr: "فالكون ريدج — تنفيذ حكم", kind: "EXECUTION", client: "CL-0001", type: "EXECUTION", court: "Dubai Courts — Court of First Instance", priority: "LOW", lead: omar.id, members: [[omar.id, "LEAD"]], official: "DEMO-EXE-220/2026", claim: 410_000, stage: "EXECUTION", summary: "Enforcement proceedings for a final judgment against a former distributor.", flags: ["NO_RECENT_ACTIVITY"], openedDaysAgo: 200 },
    { n: 7, title: "Desert Bloom — Appeal on contractor delay judgment", titleAr: "ديزرت بلوم — استئناف حكم تأخير المقاول", kind: "APPEAL", client: "CL-0002", type: "RE_DISPUTE", court: "Dubai Courts — Court of Appeal", priority: "CRITICAL", lead: mohamed.id, members: [[mohamed.id, "LEAD"], [sara.id, "OBSERVER"]], official: "DEMO-AP-512/2026", claim: 1_150_000, stage: "APPEAL", summary: "Appeal against a first-instance judgment on contractor delay penalties.", flags: ["DEADLINE_APPROACHING", "MISSING_DOCUMENTS"], billing: "FIXED", openedDaysAgo: 8 },
    { n: 8, title: "Noura Rahman — Inheritance consultation", titleAr: "نورة رحمن — استشارة ميراث", kind: "CONSULTATION", client: "CL-0006", type: "LEGAL_OPINION", priority: "LOW", status: "CLOSED", lead: ahmed.id, members: [], summary: "Advisory opinion on estate distribution. Delivered and closed.", openedDaysAgo: 60 },
  ];
  const year = new TZDate(Date.now(), TZ).getFullYear();
  const matters: Record<number, { id: string; internalNumber: string; leadLawyerId: string | null }> = {};
  for (const m of M) {
    const courtRow = m.court ? court(m.court) : undefined;
    const internalNumber = `AH-${year}-${String(m.n).padStart(5, "0")}`;
    const matter = await db.matter.create({
      data: {
        organizationId: orgId, internalNumber, officialCaseNumber: m.official ?? null, title: m.title, titleAr: m.titleAr, kind: m.kind,
        status: m.status ?? "ACTIVE", priority: m.priority, confidentiality: m.conf ?? "STANDARD", clientId: clients[m.client].id,
        caseTypeId: types[m.type], courtId: courtRow?.id, jurisdictionId: courtRow?.jurisdictionId, stageId: m.stage ? stage(m.stage) : undefined,
        ownerId: ahmed.id, leadLawyerId: m.lead, claimAmount: m.claim ? new Prisma.Decimal(m.claim) : null, summary: m.summary,
        riskFlags: m.flags ?? [], billingType: m.billing ?? "NONE", feeAmount: m.billing === "FIXED" ? new Prisma.Decimal(45000) : m.billing === "RETAINER" ? new Prisma.Decimal(15000) : null,
        hourlyRate: m.billing === "HOURLY" ? new Prisma.Decimal(1500) : null, conflictStatus: "CLEAR", conflictCheckedAt: at(-m.openedDaysAgo), conflictCheckedById: ahmed.id,
        openedAt: at(-m.openedDaysAgo), closedAt: m.status === "CLOSED" ? at(-5) : null, lastActivityAt: m.flags?.includes("NO_RECENT_ACTIVITY") ? at(-41) : at(-Math.floor(Math.random() * 4)),
        currentStatusText: m.n === 1 ? "Awaiting expert accounting report; next hearing scheduled." : null,
        lastActionText: m.n === 1 ? "Expert appointed; documents submitted to expert." : null,
        nextActionText: m.n === 1 ? "Submit reply memorandum on expert's preliminary findings." : null,
        portalEnabled: [1, 2, 3].includes(m.n), portalStatusText: m.n === 1 ? "Your case is in the hearings stage. The court has appointed an accounting expert." : null,
        createdById: ahmed.id,
        members: { create: [{ userId: ahmed.id, role: "OWNER" }, ...m.members.map(([userId, role]) => ({ userId, role }))] },
        parties: { create: [...(m.opponent ? [{ contactId: m.opponent, role: "OPPONENT" as const }] : [])] },
      },
    });
    matters[m.n] = matter;
    await db.timelineEvent.create({ data: { matterId: matter.id, eventType: "CASE_CREATED", occurredAt: at(-m.openedDaysAgo, 10), title: "Case opened", source: "SYSTEM", userId: ahmed.id } });
  }
  await db.counter.create({ data: { organizationId: orgId, key: `matter:${year}`, value: M.length } });
  await db.counter.create({ data: { organizationId: orgId, key: "client", value: C.length } });
  await db.matterParty.create({ data: { matterId: matters[1].id, contactId: expert.id, role: "EXPERT" } });

  // Checklist for matter 1 from template
  const tpl = await db.checklistTemplate.findFirst({ where: { organizationId: orgId, caseTypeId: types.COMM_DISPUTE }, include: { items: true } });
  if (tpl) {
    await db.matterChecklistItem.createMany({
      data: tpl.items.map((i) => ({ matterId: matters[1].id, order: i.order, title: i.title, titleAr: i.titleAr, required: i.required, doneAt: i.order < 9 ? at(-80 + i.order * 5) : null, doneById: i.order < 9 ? sara.id : null })),
    });
  }

  // Timeline for matter 1
  const tl: [number, string, string, string?][] = [
    [-94, "DOCUMENTS_RECEIVED", "Client documents received", "Supply agreement, 14 invoices, termination notice."],
    [-80, "CLAIM_SUBMITTED", "Statement of claim filed", "Filed with court; case number assigned."],
    [-52, "HEARING", "First hearing", "Court appointed an accounting expert."],
    [-45, "EXPERT_ASSIGNED", "Expert assigned", "Eng. Tarek Fouad appointed as accounting expert."],
    [-20, "EXPERT_MEETING", "First expert meeting", "Both parties submitted documents to the expert."],
  ];
  for (const [d, type, title, description] of tl) {
    await db.timelineEvent.create({ data: { matterId: matters[1].id, eventType: type, occurredAt: at(d, 11), title, description, source: "MANUAL", userId: sara.id } });
  }

  // Hearings — scheduled relative to today so the command center is live
  const H = [
    { m: 2, when: at(0, 11, 0), room: "Hall 4", type: "Pleading session", lawyer: sara.id, status: "READY" as const },
    { m: 1, when: at(1, 10, 30), room: "Hall 12", type: "Review of expert report", lawyer: mohamed.id, status: "PREPARING" as const, docs: "Reply memorandum; expert's preliminary report; invoice schedule." },
    { m: 3, when: at(3, 9, 0), room: "Remote", remote: true, type: "First hearing", lawyer: sara.id, status: "SCHEDULED" as const },
    { m: 7, when: at(9, 12, 0), room: "Hall 2", type: "Appeal — first session", lawyer: mohamed.id, status: "SCHEDULED" as const },
    { m: 5, when: at(14, 10, 0), room: "Hearing room B", type: "Procedural hearing", lawyer: mohamed.id, status: "SCHEDULED" as const },
  ];
  const past1 = await db.hearing.create({
    data: {
      organizationId: orgId, matterId: matters[1].id, courtId: court("Dubai Courts — Court of First Instance").id, courtRoom: "Hall 12", startsAt: at(-52, 10, 0),
      sessionType: "First hearing", attendingLawyerId: mohamed.id, status: "HELD", outcome: "Court heard both parties and referred the matter to an accounting expert.",
      decisions: "Appointment of accounting expert; parties to submit documents within 14 days.", requiredActions: "Submit invoice schedule and correspondence to the expert.",
      reportedAt: at(-52, 14), reportedById: mohamed.id, createdById: ahmed.id,
    },
  });
  const hearings: { id: string; m: number; when: Date; lawyer: string }[] = [];
  for (const h of H) {
    const row = await db.hearing.create({
      data: {
        organizationId: orgId, matterId: matters[h.m].id, courtId: h.m === 5 ? court("Arbitral Tribunal").id : h.m === 7 ? court("Dubai Courts — Court of Appeal").id : court("Dubai Courts — Court of First Instance").id,
        courtRoom: h.room, isRemote: !!h.remote, remoteUrl: h.remote ? "https://remote-hearing.example/session" : null, startsAt: h.when, endsAt: new Date(h.when.getTime() + 3600_000),
        sessionType: h.type, attendingLawyerId: h.lawyer, status: h.status, requiredDocuments: h.docs ?? null, clientAttendance: h.m === 3 ? "REQUIRED" : "NOT_REQUIRED",
        previousHearingId: h.m === 1 ? past1.id : null, createdById: ahmed.id,
        preparationNotes: h.m === 1 ? "Focus on the expert's treatment of credit notes. Prepare the reconciliation table." : null,
      },
    });
    hearings.push({ id: row.id, m: h.m, when: h.when, lawyer: h.lawyer });
  }

  // Deadlines (one AI-extracted needs verification)
  const D = [
    { m: 7, type: "APPEAL" as const, title: "File appeal memorandum", due: hoursFromNow(20), critical: true, assignee: mohamed.id },
    { m: 1, type: "SUBMISSION" as const, title: "Submit reply to expert's preliminary report", due: at(1, 9, 0), critical: true, assignee: sara.id },
    { m: 3, type: "DOCUMENT" as const, title: "Obtain salary certificates from client", due: at(2, 17, 0), assignee: omar.id },
    { m: 2, type: "PAYMENT" as const, title: "Court fee payment for amended claim", due: at(5, 13, 0), assignee: layla.id },
    { m: 6, type: "FOLLOW_UP" as const, title: "Follow up on asset search results", due: at(-2, 12, 0), assignee: omar.id },
    { m: 1, type: "SUBMISSION" as const, title: "Deadline to comment on final expert report (extracted from court notice)", due: at(16, 14, 0), assignee: sara.id, ai: true },
  ];
  const deadlines: { id: string; due: Date; assignee: string }[] = [];
  for (const d of D) {
    const row = await db.deadline.create({
      data: {
        organizationId: orgId, matterId: matters[d.m].id, type: d.type, title: d.title, dueAt: d.due, isCritical: !!d.critical, assigneeId: d.assignee,
        verification: d.ai ? "NEEDS_VERIFICATION" : "CONFIRMED", source: d.ai ? "AI" : "MANUAL", createdById: ahmed.id,
      },
    });
    deadlines.push({ id: row.id, due: d.due, assignee: d.assignee });
    if (d.ai) {
      await db.approval.create({
        data: { organizationId: orgId, kind: "DEADLINE_VERIFICATION", entityType: "Deadline", entityId: row.id, matterId: matters[d.m].id, title: d.title, requestedById: sara.id, assignedToId: ahmed.id },
      });
    }
  }

  // Materialise reminders (same rule as the live engine)
  const policies = await db.reminderPolicy.findMany({ where: { organizationId: orgId } });
  const offsetsFor = (t: string) => policies.find((p) => p.subjectType === t)?.offsetsMinutes ?? DEFAULT_REMINDER_OFFSETS[t];
  for (const h of hearings) {
    for (const r of reminderSchedule(h.when, offsetsFor("HEARING"))) {
      await db.reminder.create({ data: { organizationId: orgId, subjectType: "HEARING", subjectId: h.id, userId: h.lawyer, fireAt: r.fireAt, offsetMinutes: r.offsetMinutes, channels: ["IN_APP", "EMAIL"] } });
    }
  }
  for (const d of deadlines.filter((x) => x.due > new Date())) {
    for (const r of reminderSchedule(d.due, offsetsFor("DEADLINE"))) {
      await db.reminder.create({ data: { organizationId: orgId, subjectType: "DEADLINE", subjectId: d.id, userId: d.assignee, fireAt: r.fireAt, offsetMinutes: r.offsetMinutes, channels: ["IN_APP", "EMAIL"] } });
    }
  }

  // Appointments
  const A = [
    { type: "CONSULTATION" as const, title: "Initial consultation — shareholder dispute", start: at(0, 13, 0), mins: 60, lawyer: ahmed.id, location: "Office — Meeting room 1" },
    { type: "CASE_MEETING" as const, title: "Falcon Ridge — pre-hearing meeting", start: at(0, 16, 0), mins: 45, lawyer: mohamed.id, client: "CL-0001", matter: 1, url: "https://meet.example/falcon" },
    { type: "DOCUMENT_SIGNING" as const, title: "Power of attorney signing — Youssef Karim", start: at(2, 11, 0), mins: 30, lawyer: sara.id, client: "CL-0003", matter: 3, location: "Office" },
    { type: "INTERNAL_MEETING" as const, title: "Weekly litigation review", start: at(4, 9, 0), mins: 60, lawyer: ahmed.id, location: "Office — Board room" },
  ];
  for (const a of A) {
    await db.appointment.create({
      data: {
        organizationId: orgId, type: a.type, title: a.title, startsAt: a.start, endsAt: new Date(a.start.getTime() + a.mins * 60_000), lawyerId: a.lawyer,
        clientId: a.client ? clients[a.client].id : null, matterId: a.matter ? matters[a.matter].id : null, location: a.location ?? null, meetingUrl: a.url ?? null,
        createdById: ahmed.id, portalVisible: !!a.client,
      },
    });
  }

  // Tasks
  const T = [
    { m: 1, title: "Draft reply memorandum on expert report", a: sara.id, p: "CRITICAL" as const, due: at(0, 18, 0), s: "IN_PROGRESS" as const },
    { m: 1, title: "Prepare invoice reconciliation table", a: omar.id, p: "HIGH" as const, due: at(0, 15, 0), s: "TODO" as const },
    { m: 7, title: "Collect missing site progress reports from client", a: mohamed.id, p: "CRITICAL" as const, due: at(-1, 17, 0), s: "WAITING" as const },
    { m: 3, title: "Calculate gratuity entitlement", a: omar.id, p: "NORMAL" as const, due: at(2, 17, 0), s: "TODO" as const },
    { m: 2, title: "Send rent arrears statement to client for confirmation", a: layla.id, p: "NORMAL" as const, due: at(-3, 12, 0), s: "TODO" as const },
    { m: 4, title: "Mark up limitation of liability clause", a: mohamed.id, p: "HIGH" as const, due: at(1, 12, 0), s: "TODO" as const },
    { m: 6, title: "Request asset search update", a: omar.id, p: "LOW" as const, due: at(6, 12, 0), s: "TODO" as const },
    { m: 2, title: "Review tenant's defence memorandum", a: sara.id, p: "HIGH" as const, due: at(-5, 12, 0), s: "DONE" as const },
  ];
  for (const t of T) {
    await db.task.create({
      data: {
        organizationId: orgId, matterId: matters[t.m].id, title: t.title, assigneeId: t.a, createdById: ahmed.id, priority: t.p, status: t.s, dueAt: t.due,
        completedAt: t.s === "DONE" ? at(-5, 16) : null, estimateMinutes: 120,
      },
    });
  }
  await db.task.create({ data: { organizationId: orgId, title: "Renew professional indemnity insurance", assigneeId: ahmed.id, createdById: ahmed.id, priority: "NORMAL", dueAt: at(10, 12) } });

  // Documents (real PDF files on local storage)
  async function addDoc(m: number | null, title: string, category: Prisma.DocumentCreateInput["category"], status: Prisma.DocumentCreateInput["status"], pages: string[][], by: string, extra: Partial<Prisma.DocumentUncheckedCreateInput> = {}, versions = 1) {
    const doc = await db.document.create({
      data: {
        organizationId: orgId, matterId: m ? matters[m].id : null, title, category: category!, status: status!, createdById: by, currentVersion: versions,
        searchText: pages.flat().join("\n"), ...extra,
      },
    });
    for (let v = 1; v <= versions; v++) {
      const buf = simplePdf(pages.map((p, i) => (v === versions ? p : [...p.slice(0, 3), `[Earlier draft v${v}]`, ...p.slice(3)]).concat(i === 0 ? [] : [])));
      const vid = randomUUID();
      const key = `${orgId}/${doc.id}/${vid}.pdf`;
      await mkdir(path.join(STORAGE_DIR, orgId, doc.id), { recursive: true });
      await writeFile(path.join(STORAGE_DIR, key), buf);
      await db.documentVersion.create({
        data: {
          id: vid, documentId: doc.id, version: v, fileName: `${matters[m ?? 1]?.internalNumber ?? "AH"}_${title.replace(/[^A-Za-z0-9]+/g, "-")}_v${v}.pdf`,
          storageKey: key, mimeType: "application/pdf", sizeBytes: BigInt(buf.length), checksumSha256: createHash("sha256").update(buf).digest("hex"),
          status: v === versions ? status! : "DRAFT", uploadedById: by, extractedText: pages.flat().join("\n"), pageTexts: pages.map((p, i) => ({ page: i + 1, text: p.join("\n") })),
          textStatus: "DONE", pageCount: pages.length, createdAt: at(-30 + v * 5),
        },
      });
    }
    return doc;
  }
  const contract = await addDoc(1, "Supply Agreement (2024)", "CONTRACT", "APPROVED", [
    ["SUPPLY AGREEMENT - DEMO DOCUMENT", "", "This Supply Agreement is made on 3 January 2024 between", "Falcon Ridge Trading LLC (the Buyer) and", "Gulf Horizon Supplies LLC (the Supplier)."],
    ["Clause 4 - Payment", "", "The Buyer shall pay each invoice within 60 days of receipt.", "Late payments accrue interest at 1% per month."],
    ["Clause 11 - Termination", "", "Either party may terminate on 90 days written notice.", "Termination does not affect accrued rights."],
  ], sara.id);
  await addDoc(1, "Court notice — expert report deadline", "COURT", "APPROVED", [["COURT NOTICE - DEMO", "", "Parties are notified that the final expert report", "will be filed. Comments may be submitted within the period", "specified by the court."]], mohamed.id);
  const memo = await addDoc(1, "Reply memorandum on expert findings", "LEGAL_MEMO", "UNDER_REVIEW", [["REPLY MEMORANDUM - DRAFT - DEMO", "", "1. The expert did not account for credit notes 7 and 9.", "2. Interest calculation should apply Clause 4 of the agreement."]], sara.id, {}, 3);
  await addDoc(2, "Tenancy contract — Unit G-14", "CONTRACT", "APPROVED", [["TENANCY CONTRACT - DEMO", "", "Unit G-14, annual rent AED 380,000 payable quarterly."]], layla.id, { portalShared: true });
  await addDoc(7, "First instance judgment", "JUDGMENT", "APPROVED", [["JUDGMENT - DEMO DOCUMENT", "", "The court ruled on the contractor delay penalties claim."]], mohamed.id);
  await addDoc(5, "Bill of lading and cargo manifest", "EVIDENCE", "APPROVED", [["BILL OF LADING - DEMO", "", "Container ref DEMO-CNT-001."]], mohamed.id, { confidentiality: "HIGHLY_CONFIDENTIAL" });
  await db.approval.create({
    data: { organizationId: orgId, kind: "DOCUMENT", entityType: "Document", entityId: memo.id, matterId: matters[1].id, title: "Reply memorandum on expert findings (v3)", requestedById: sara.id, assignedToId: ahmed.id },
  });
  void contract;

  // Notes & comments
  await db.note.create({ data: { matterId: matters[1].id, authorId: mohamed.id, visibility: "TEAM", body: "Opposing counsel indicated willingness to discuss settlement after the expert report. Do not raise before the hearing.", pinned: true } });
  await db.note.create({ data: { matterId: matters[1].id, authorId: ahmed.id, visibility: "PRIVATE", body: "Consider proposing mediation if the expert report is favourable." } });
  await db.note.create({ data: { matterId: matters[1].id, authorId: sara.id, visibility: "CLIENT", body: "The expert meeting took place and all requested documents were submitted.", sharedAt: at(-19) } });
  await db.comment.create({ data: { authorId: mohamed.id, matterId: matters[1].id, body: "@Sara please review the memo before 4 PM.", mentions: [sara.id] } });

  // Communications
  await db.communication.createMany({
    data: [
      { organizationId: orgId, matterId: matters[1].id, clientId: clients["CL-0001"].id, channel: "CALL", direction: "OUTBOUND", subject: "Update on expert meeting", occurredAt: at(-19, 15), userId: sara.id },
      { organizationId: orgId, matterId: matters[1].id, clientId: clients["CL-0001"].id, channel: "EMAIL", direction: "INBOUND", subject: "Additional invoices attached", occurredAt: at(-12, 10), userId: sara.id },
      { organizationId: orgId, matterId: matters[2].id, clientId: clients["CL-0002"].id, channel: "MEETING", direction: "INTERNAL", subject: "Strategy meeting", occurredAt: at(-7, 12), userId: sara.id },
    ],
  });

  // Finance
  const invoice = async (n: number, client: string, m: number, items: [string, number][], status: "ISSUED" | "PAID" | "PARTIALLY_PAID" | "DRAFT", issued: number, dueIn: number, paid = 0) => {
    const subtotal = items.reduce((s, [, a]) => s + a, 0);
    const vat = Math.round(subtotal * 0.05 * 100) / 100;
    const inv = await db.invoice.create({
      data: {
        organizationId: orgId, number: `INV-${year}-${String(n).padStart(4, "0")}`, clientId: clients[client].id, matterId: matters[m].id, issueDate: at(issued), dueDate: at(issued + dueIn),
        status, subtotal, vatRate: 5, vatAmount: vat, total: subtotal + vat, amountPaid: paid, createdById: finance.id, portalVisible: status !== "DRAFT",
        items: { create: items.map(([description, amount], order) => ({ description, unitPrice: amount, amount, order })) },
      },
    });
    if (paid > 0) {
      await db.payment.create({ data: { organizationId: orgId, invoiceId: inv.id, amount: paid, method: "BANK_TRANSFER", receivedAt: at(issued + 10), reference: "DEMO-TRX-" + n, recordedById: finance.id } });
    }
    return inv;
  };
  await invoice(1, "CL-0001", 1, [["Retainer — Q3", 15000], ["Court filing fee (disbursement)", 6800]], "PAID", -70, 30, 22890);
  await invoice(2, "CL-0002", 2, [["Fixed fee — first instalment", 22500]], "PARTIALLY_PAID", -40, 30, 10000);
  await invoice(3, "CL-0004", 4, [["Contract review — 12.5 hours", 18750]], "ISSUED", -35, 14);
  await db.counter.create({ data: { organizationId: orgId, key: `invoice:${year}`, value: 3 } });
  await db.expense.createMany({
    data: [
      { organizationId: orgId, matterId: matters[1].id, category: "EXPERT_FEE", description: "Expert deposit", amount: 12000, incurredAt: at(-44), createdById: finance.id },
      { organizationId: orgId, matterId: matters[1].id, category: "TRANSLATION", description: "Legal translation of supply agreement", amount: 1850, incurredAt: at(-88), createdById: layla.id },
      { organizationId: orgId, matterId: matters[7].id, category: "COURT_FEE", description: "Appeal filing fee", amount: 3200, incurredAt: at(-3), createdById: finance.id },
    ],
  });
  const TE: [string, number, string, number, number][] = [
    [mohamed.id, 4, "REVIEW", 150, -6], [mohamed.id, 4, "DRAFTING", 210, -4], [mohamed.id, 4, "CALL", 30, -2],
    [sara.id, 1, "DRAFTING", 240, -1], [sara.id, 1, "RESEARCH", 90, -2], [omar.id, 1, "RESEARCH", 180, -1], [mohamed.id, 5, "MEETING", 120, -3],
  ];
  for (const [u, m, activity, minutes, d] of TE) {
    await db.timeEntry.create({ data: { organizationId: orgId, matterId: matters[m].id, userId: u, activity, minutes, startedAt: at(d, 10), endedAt: at(d, 10 + Math.ceil(minutes / 60)), billable: true, rate: 1500 } });
  }

  // CRM leads
  const stagesCRM = await db.pipelineStage.findMany({ where: { organizationId: orgId }, orderBy: { order: "asc" } });
  const L = [
    ["Khaled Nasser", "WEBSITE", "Shareholder dispute in a family LLC", "Corporate dispute", 120000, 0],
    ["Blue Palm Hospitality", "REFERRAL", "Review of hotel management agreement", "Contract review", 60000, 2],
    ["Mona Adel", "PHONE", "Unpaid wages claim", "Labour", 15000, 1],
    ["Vertex Engineering FZCO", "WEBSITE", "Construction delay claim", "Construction dispute", 250000, 3],
    ["Samir Haddad", "SOCIAL", "Tenancy renewal dispute", "Real estate", 20000, 6],
  ] as const;
  for (const [name, source, inquiry, service, value, s] of L) {
    await db.lead.create({
      data: { organizationId: orgId, name, source, inquiry, service, estimatedValue: value, stageId: stagesCRM[s].id, assignedToId: ahmed.id, email: `${name.split(" ")[0].toLowerCase()}@lead.example`, phone: "+971 50 000 0002", nextFollowUpAt: at(s + 1, 11), lostReason: s === 6 ? "Chose another firm" : null },
    });
  }

  // Portal user for client CL-0001 (synthetic)
  await db.user.create({
    data: { organizationId: orgId, kind: "CLIENT", email: "client@demo.ahlegal.test", name: "Hamad Saeed", nameAr: "حمد سعيد", roleId: roles.client, passwordHash: pw, clientId: clients["CL-0001"].id, locale: "ar" },
  });

  // Notifications & activity
  await db.notification.createMany({
    data: [
      { organizationId: orgId, userId: ahmed.id, category: "CRITICAL", title: "Appeal memorandum due in less than 24 hours", body: matters[7].internalNumber, link: `/app/cases/${matters[7].id}` },
      { organizationId: orgId, userId: ahmed.id, category: "DOCUMENT", title: "Reply memorandum v3 awaits your approval", body: matters[1].internalNumber, link: `/app/approvals` },
      { organizationId: orgId, userId: ahmed.id, category: "DEADLINE", title: "AI-extracted deadline needs verification", body: matters[1].internalNumber, link: `/app/approvals` },
      { organizationId: orgId, userId: ahmed.id, category: "HEARING", title: "Hearing today at 11:00 — Desert Bloom lease", body: matters[2].internalNumber, link: `/app/cases/${matters[2].id}/hearings`, readAt: new Date() },
      { organizationId: orgId, userId: sara.id, category: "TASK", title: "Mohamed mentioned you: review the memo before 4 PM", link: `/app/cases/${matters[1].id}` },
    ],
  });
  const acts: [number, string, string, Record<string, string>, string][] = [
    [1, "document.version_uploaded", "Document", { title: "Reply memorandum on expert findings", version: "3" }, sara.id],
    [7, "document.uploaded", "Document", { title: "First instance judgment" }, mohamed.id],
    [1, "hearing.updated", "Hearing", { title: "Review of expert report" }, mohamed.id],
    [2, "task.completed", "Task", { title: "Review tenant's defence memorandum" }, sara.id],
    [3, "matter.updated", "Matter", { field: "stage" }, sara.id],
  ];
  for (const [i, [m, type, entityType, data, actor]] of acts.entries()) {
    await db.activity.create({ data: { organizationId: orgId, matterId: matters[m].id, actorId: actor, type, entityType, data, createdAt: new Date(Date.now() - (i + 1) * 2.5 * 3600_000) } });
  }

  // Website CMS placeholder content — flagged as placeholder until the consultant supplies real content
  const areas = [
    ["commercial-disputes", "Commercial Disputes", "النزاعات التجارية", "Representation in commercial claims and contract disputes.", "التمثيل في الدعاوى التجارية ونزاعات العقود."],
    ["real-estate", "Real Estate", "العقارات", "Advice and disputes relating to property and tenancy.", "الاستشارات والنزاعات المتعلقة بالعقارات والإيجارات."],
    ["employment", "Employment", "العمل", "Employment contracts and labour claims.", "عقود العمل والدعاوى العمالية."],
    ["corporate-advisory", "Corporate & Contracts", "الشركات والعقود", "Drafting and reviewing commercial agreements.", "صياغة ومراجعة الاتفاقيات التجارية."],
  ];
  for (const [i, [slug, titleEn, titleAr, summaryEn, summaryAr]] of areas.entries()) {
    await db.practiceArea.create({ data: { organizationId: orgId, slug, titleEn, titleAr, summaryEn, summaryAr, order: i, published: true } });
  }
  await db.faq.createMany({
    data: [
      { organizationId: orgId, questionEn: "How do I book a consultation?", questionAr: "كيف أحجز استشارة؟", answerEn: "Use the Book Consultation page to choose a service, date and time.", answerAr: "استخدم صفحة حجز الاستشارة لاختيار الخدمة والتاريخ والوقت.", order: 0 },
      { organizationId: orgId, questionEn: "Are consultations available online?", questionAr: "هل تتوفر الاستشارات عن بُعد؟", answerEn: "Yes, you can choose an online or in-office consultation.", answerAr: "نعم، يمكنك اختيار استشارة عن بُعد أو في المكتب.", order: 1 },
    ],
  });
  await db.siteSetting.createMany({
    data: [
      { organizationId: orgId, key: "contact", value: { phone: "+971 4 000 0000", email: "info@example.ae", addressEn: "Dubai, United Arab Emirates", addressAr: "دبي، الإمارات العربية المتحدة", hours: "Mon–Fri 9:00–18:00" } },
      { organizationId: orgId, key: "placeholder", value: { active: true } },
      { organizationId: orgId, key: "booking", value: { slotMinutes: 60, days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 } },
    ],
  });

  console.log(`• Demo users (password: ${DEMO_PASSWORD})`);
  console.log("  owner      ahmed@demo.ahlegal.test");
  console.log("  senior     mohamed@demo.ahlegal.test");
  console.log("  lawyer     sara@demo.ahlegal.test   (restricted: cannot see AH-…-00004/5/6)");
  console.log("  junior     omar@demo.ahlegal.test");
  console.log("  finance    finance@demo.ahlegal.test");
  console.log("  portal     client@demo.ahlegal.test  (/portal/login)");
}

async function main() {
  const org = await db.organization.upsert({
    where: { slug: "ahmed-heikal" },
    update: {},
    create: {
      slug: "ahmed-heikal", name: "Ahmed Heikal Legal Consultancy", nameAr: "مكتب المستشار أحمد هيكل للاستشارات القانونية",
      timezone: TZ, currency: "AED", defaultLocale: "ar", isDemo: SEED_DEMO,
      settings: { alertThresholds: null, ai: { enabled: false, allowDocumentProcessing: false }, retention: { closedMatterYears: 10 }, hijri: true },
    },
  });
  const { roles } = await seedFoundation(org.id);
  console.log("✓ Foundation seeded");
  if (SEED_DEMO) {
    await seedDemo(org.id, roles);
    console.log("✓ Demo dataset seeded");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
