/**
 * Legal Deadline Engine — pure logic shared by server (reminder scheduling,
 * dashboards) and client (live countdowns). Covered by tests/unit/deadline.test.ts.
 */

export type AlertLevel = "OVERDUE" | "IMMEDIATE" | "CRITICAL" | "HIGH" | "PRIORITY" | "REMINDER" | "NONE";

export interface AlertThreshold {
  level: Exclude<AlertLevel, "OVERDUE" | "NONE">;
  /** Minutes before the event at which this level begins. */
  minutes: number;
}

/** Defaults from the brief: 7d reminder, 3d priority, 24h high, 6h critical, 1h immediate. Org-configurable. */
export const DEFAULT_THRESHOLDS: AlertThreshold[] = [
  { level: "IMMEDIATE", minutes: 60 },
  { level: "CRITICAL", minutes: 6 * 60 },
  { level: "HIGH", minutes: 24 * 60 },
  { level: "PRIORITY", minutes: 3 * 24 * 60 },
  { level: "REMINDER", minutes: 7 * 24 * 60 },
];

export const LEVEL_ORDER: AlertLevel[] = ["OVERDUE", "IMMEDIATE", "CRITICAL", "HIGH", "PRIORITY", "REMINDER", "NONE"];

export function alertLevel(dueAt: Date, now: Date = new Date(), thresholds: AlertThreshold[] = DEFAULT_THRESHOLDS): AlertLevel {
  const minutesLeft = (dueAt.getTime() - now.getTime()) / 60_000;
  if (minutesLeft < 0) return "OVERDUE";
  const sorted = [...thresholds].sort((a, b) => a.minutes - b.minutes);
  for (const t of sorted) if (minutesLeft <= t.minutes) return t.level;
  return "NONE";
}

export function compareLevels(a: AlertLevel, b: AlertLevel) {
  return LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b);
}

export interface Countdown {
  past: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

export function countdown(target: Date, now: Date = new Date()): Countdown {
  const totalMs = target.getTime() - now.getTime();
  const past = totalMs < 0;
  let s = Math.floor(Math.abs(totalMs) / 1000);
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  return { past, days, hours, minutes, seconds: s - minutes * 60, totalMs };
}

/** Default reminder offsets (minutes before event) per event type. Org-configurable via ReminderPolicy. */
export const DEFAULT_REMINDER_OFFSETS: Record<string, number[]> = {
  HEARING: [7 * 1440, 3 * 1440, 1440, 180],
  DEADLINE: [7 * 1440, 3 * 1440, 1440, 360, 60],
  APPOINTMENT: [1440, 60],
  TASK: [1440],
};

/**
 * Compute the reminder instants for an event. Offsets already in the past are
 * dropped, except that an event created inside its reminder window still gets one
 * immediate reminder so nobody silently misses it.
 */
export function reminderSchedule(eventAt: Date, offsetsMinutes: number[], now: Date = new Date()) {
  const out: { offsetMinutes: number; fireAt: Date }[] = [];
  let skippedPast = false;
  for (const off of [...new Set(offsetsMinutes)].sort((a, b) => b - a)) {
    const fireAt = new Date(eventAt.getTime() - off * 60_000);
    if (fireAt.getTime() <= now.getTime()) {
      skippedPast = true;
      continue;
    }
    out.push({ offsetMinutes: off, fireAt });
  }
  if (skippedPast && eventAt.getTime() > now.getTime() && out.length === 0) {
    out.push({ offsetMinutes: Math.round((eventAt.getTime() - now.getTime()) / 60_000), fireAt: now });
  }
  return out;
}
