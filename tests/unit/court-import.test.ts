import { describe, expect, it } from "vitest";
import { suggestFromText, datesIn, normaliseDigits } from "@/lib/court-import";

describe("court import suggestions", () => {
  it("normalises Arabic-Indic digits", () => {
    expect(normaliseDigits("٢٤/٠٩/٢٠٢٦")).toBe("24/09/2026");
  });

  it("reads dd/mm/yyyy (UAE) and ISO dates, rejecting impossible ones", () => {
    expect(datesIn("on 03/10/2026 and 2026-11-05")).toEqual(["2026-11-05", "2026-10-03"]);
    expect(datesIn("31/02/2026")).toEqual([]);
  });

  it("classifies hearings, deadlines, decisions, case numbers and courts", () => {
    const text = [
      "محاكم دبي — المحكمة الابتدائية",
      "الدعوى رقم 1452/2026 تجاري",
      "قررت المحكمة تأجيل الجلسة إلى ١٥/١٠/٢٠٢٦ الساعة 10:30",
      "Submit the reply memorandum no later than 08/10/2026",
      "The court decided to appoint an accounting expert on 20/09/2026",
    ].join("\n");
    const s = suggestFromText(text);
    expect(s.find((x) => x.kind === "CASE_NUMBER")?.value).toContain("1452/2026");
    expect(s.find((x) => x.kind === "HEARING")?.date).toBe("2026-10-15T10:30");
    expect(s.find((x) => x.kind === "DEADLINE")?.date).toBe("2026-10-08");
    expect(s.find((x) => x.kind === "DECISION")?.date).toBe("2026-09-20");
    expect(s.some((x) => x.kind === "COURT")).toBe(true);
  });

  it("does not treat an unlabelled date as a case number", () => {
    expect(suggestFromText("12/2026 was mentioned").filter((x) => x.kind === "CASE_NUMBER")).toEqual([]);
  });

  it("returns nothing for unrelated text and caps output", () => {
    expect(suggestFromText("hello world")).toEqual([]);
    const many = Array.from({ length: 200 }, (_, i) => `hearing on ${String((i % 28) + 1).padStart(2, "0")}/10/2026 #${i}`).join("\n");
    expect(suggestFromText(many).length).toBeLessThanOrEqual(60);
  });
});
