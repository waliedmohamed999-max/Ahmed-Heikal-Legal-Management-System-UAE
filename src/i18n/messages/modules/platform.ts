const en = {
  integrations: {
    title: "Integrations",
    subtitle: "Real connection status only. Nothing is shown as connected unless it is actually configured.",
    categories: { EMAIL: "Email", CALENDAR: "Calendar", STORAGE: "Storage", SMS: "SMS", WHATSAPP: "WhatsApp Business", ACCOUNTING: "Accounting", AI: "AI", OCR: "OCR", FEDERAL: "Federal authorities", LOCAL_COURTS: "Local courts" },
    providers: {
      MICROSOFT_365: "Microsoft 365", GOOGLE_WORKSPACE: "Google Workspace", SMTP: "SMTP email", GOOGLE_CALENDAR: "Google Calendar", OUTLOOK_CALENDAR: "Outlook Calendar",
      S3_STORAGE: "S3-compatible storage", SMS: "SMS provider", WHATSAPP_BUSINESS: "WhatsApp Business Cloud API", ACCOUNTING: "Accounting system", AI_PROVIDER: "AI provider (Anthropic)",
      OCR: "OCR provider", FEDERAL_JUSTICE_SERVICES: "Federal justice services", DUBAI_COURTS: "Dubai Courts", ABU_DHABI_JUDICIAL_DEPARTMENT: "Abu Dhabi Judicial Department",
    },
    govNote: "No scraping or automation of government portals. No government credentials are stored and UAE PASS / OTP flows are never bypassed. Where no documented API exists, use Court data import.",
    importCta: "Court data import",
    whatsappNote: "Only the official WhatsApp Business API is supported — never a personal WhatsApp login.",
    detail: "Detail",
    lastChecked: "Last checked",
  },
  resources: {
    title: "UAE Legal Resources",
    subtitle: "Official portals and references. Links open the official sites — the system does not log in to them on your behalf.",
    categories: { LEGISLATION: "Legislation", FEDERAL: "Federal", LOCAL_COURT: "Local courts", FREE_ZONE: "Free-zone courts", OTHER: "Other" },
    add: "Add resource",
    url: "URL",
  },
  courtImport: {
    title: "Court data import",
    subtitle: "Upload a court PDF, Excel/CSV export, email or screenshot. The system suggests case numbers, dates, hearings and deadlines — nothing is saved until you review it.",
    upload: "Upload file",
    matter: "Case (optional)",
    suggestions: "Suggestions",
    noSuggestions: "Nothing recognisable was found. Enter the details manually.",
    kinds: { CASE_NUMBER: "Case number", HEARING: "Hearing", DEADLINE: "Deadline", DATE: "Date", DECISION: "Decision", COURT: "Court" },
    apply: "Apply selected",
    discard: "Discard",
    applied: "Applied — imported deadlines are marked “Needs verification”.",
    ocrMissing: "This file needs OCR, which is not configured. Its text could not be read.",
    history: "Recent imports",
    source: "Source text",
  },
};

const ar: typeof en = {
  integrations: {
    title: "التكاملات",
    subtitle: "حالة الاتصال الحقيقية فقط. لا يظهر أي تكامل كمتصل ما لم يكن مُعدًّا فعلًا.",
    categories: { EMAIL: "البريد الإلكتروني", CALENDAR: "التقويم", STORAGE: "التخزين", SMS: "الرسائل النصية", WHATSAPP: "واتساب للأعمال", ACCOUNTING: "المحاسبة", AI: "الذكاء الاصطناعي", OCR: "التعرف الضوئي", FEDERAL: "الجهات الاتحادية", LOCAL_COURTS: "المحاكم المحلية" },
    providers: {
      MICROSOFT_365: "مايكروسوفت 365", GOOGLE_WORKSPACE: "جوجل وورك سبيس", SMTP: "بريد SMTP", GOOGLE_CALENDAR: "تقويم جوجل", OUTLOOK_CALENDAR: "تقويم آوتلوك",
      S3_STORAGE: "تخزين متوافق مع S3", SMS: "مزوّد الرسائل النصية", WHATSAPP_BUSINESS: "واجهة واتساب للأعمال السحابية", ACCOUNTING: "نظام المحاسبة", AI_PROVIDER: "مزوّد الذكاء الاصطناعي (Anthropic)",
      OCR: "مزوّد التعرف الضوئي", FEDERAL_JUSTICE_SERVICES: "خدمات العدل الاتحادية", DUBAI_COURTS: "محاكم دبي", ABU_DHABI_JUDICIAL_DEPARTMENT: "دائرة القضاء – أبوظبي",
    },
    govNote: "لا يتم استخراج بيانات البوابات الحكومية آليًا ولا أتمتتها. لا تُخزَّن بيانات دخول حكومية ولا يُتحايل على الهوية الرقمية UAE PASS أو رموز التحقق. عند عدم وجود واجهة برمجية موثقة استخدم استيراد بيانات المحاكم.",
    importCta: "استيراد بيانات المحاكم",
    whatsappNote: "يُدعم فقط واجهة واتساب للأعمال الرسمية — ولا يُستخدم حساب واتساب شخصي.",
    detail: "التفاصيل",
    lastChecked: "آخر فحص",
  },
  resources: {
    title: "المصادر القانونية الإماراتية",
    subtitle: "البوابات والمراجع الرسمية. تفتح الروابط المواقع الرسمية — لا يسجّل النظام الدخول إليها نيابةً عنك.",
    categories: { LEGISLATION: "التشريعات", FEDERAL: "اتحادي", LOCAL_COURT: "المحاكم المحلية", FREE_ZONE: "محاكم المناطق الحرة", OTHER: "أخرى" },
    add: "إضافة مصدر",
    url: "الرابط",
  },
  courtImport: {
    title: "استيراد بيانات المحاكم",
    subtitle: "ارفع ملف PDF من المحكمة أو ملف Excel/CSV أو بريدًا أو لقطة شاشة. يقترح النظام أرقام القضايا والتواريخ والجلسات والمواعيد — ولا يُحفظ شيء قبل مراجعتك.",
    upload: "رفع ملف",
    matter: "القضية (اختياري)",
    suggestions: "المقترحات",
    noSuggestions: "لم يُعثر على بيانات واضحة. أدخل التفاصيل يدويًا.",
    kinds: { CASE_NUMBER: "رقم قضية", HEARING: "جلسة", DEADLINE: "موعد نهائي", DATE: "تاريخ", DECISION: "قرار", COURT: "محكمة" },
    apply: "تطبيق المحدد",
    discard: "تجاهل",
    applied: "تم التطبيق — المواعيد المستوردة معلّمة «يحتاج تحققًا».",
    ocrMissing: "يحتاج هذا الملف إلى تعرف ضوئي غير مُعد، ولم يمكن قراءة نصه.",
    history: "آخر عمليات الاستيراد",
    source: "النص المصدر",
  },
};

const messages = { en, ar };
export default messages;
