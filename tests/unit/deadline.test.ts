import { describe, expect, it } from "vitest";
import { alertLevel, countdown, reminderSchedule, DEFAULT_THRESHOLDS } from "@/lib/deadline";
import { parseOffsets, formatOffsets } from "@/lib/admin-schemas";

const now = new Date("2026-09-23T08:00:00Z");
const inMin = (m: number) => new Date(now.getTime() + m * 60_000);

describe("alert levels (7d / 3d / 24h / 6h / 1h)", () => {
  it.each([
    [-1, "OVERDUE"],
    [30, "IMMEDIATE"],
    [60, "IMMEDIATE"],
    [61, "CRITICAL"],
    [6 * 60, "CRITICAL"],
    [12 * 60, "HIGH"],
    [24 * 60, "HIGH"],
    [2 * 1440, "PRIORITY"],
    [3 * 1440, "PRIORITY"],
    [5 * 1440, "REMINDER"],
    [7 * 1440, "REMINDER"],
    [8 * 1440, "NONE"],
  ])("%i minutes left → %s", (m, level) => {
    expect(alertLevel(inMin(m), now)).toBe(level);
  });

  it("uses org-configured thresholds", () => {
    const custom = [{ level: "IMMEDIATE" as const, minutes: 120 }, ...DEFAULT_THRESHOLDS.filter((t) => t.level !== "IMMEDIATE")];
    expect(alertLevel(inMin(90), now, custom)).toBe("IMMEDIATE");
  });
});

describe("countdown", () => {
  it("splits remaining time", () => {
    const c = countdown(inMin(2 * 1440 + 3 * 60 + 4), now);
    expect(c).toMatchObject({ past: false, days: 2, hours: 3, minutes: 4, seconds: 0 });
  });
  it("reports overdue time as past", () => {
    const c = countdown(inMin(-90), now);
    expect(c).toMatchObject({ past: true, days: 0, hours: 1, minutes: 30 });
  });
});

describe("reminder schedule", () => {
  it("creates one reminder per future offset, latest first-fired order", () => {
    const r = reminderSchedule(inMin(10 * 1440), [1440, 7 * 1440, 60], now);
    expect(r.map((x) => x.offsetMinutes)).toEqual([7 * 1440, 1440, 60]);
  });
  it("drops past offsets and dedupes", () => {
    const r = reminderSchedule(inMin(2 * 1440), [7 * 1440, 1440, 1440], now);
    expect(r.map((x) => x.offsetMinutes)).toEqual([1440]);
  });
  it("an event created inside every window still gets one immediate reminder", () => {
    const r = reminderSchedule(inMin(30), [1440, 60], now);
    expect(r).toHaveLength(1);
    expect(r[0].fireAt.getTime()).toBe(now.getTime());
  });
  it("past events get no reminders", () => {
    expect(reminderSchedule(inMin(-5), [60], now)).toEqual([]);
  });
});

describe("reminder offset settings", () => {
  it("parses and formats d/h/m offsets, including Arabic comma", () => {
    expect(parseOffsets("7d, 3d، 1d 6h 30m bad")).toEqual([10080, 4320, 1440, 360, 30]);
    expect(formatOffsets([30, 1440, 360])).toBe("1d, 6h, 30m");
  });
});
