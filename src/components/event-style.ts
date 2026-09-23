import { Gavel, CalendarClock, Users, UserRound, FileUp, Microscope, Wallet, CheckSquare, RotateCw, type LucideIcon } from "lucide-react";

/** Semantic event palette — one colour per event type across calendar, agenda and widgets (server + client safe). */
export const EVENT_STYLE: Record<string, { color: string; icon: LucideIcon }> = {
  HEARING: { color: "var(--ev-hearing)", icon: Gavel },
  COURT_DEADLINE: { color: "var(--ev-court-deadline)", icon: CalendarClock },
  CLIENT_MEETING: { color: "var(--ev-client-meeting)", icon: UserRound },
  INTERNAL_MEETING: { color: "var(--ev-internal-meeting)", icon: Users },
  SUBMISSION: { color: "var(--ev-submission)", icon: FileUp },
  EXPERT_MEETING: { color: "var(--ev-expert)", icon: Microscope },
  PAYMENT: { color: "var(--ev-payment)", icon: Wallet },
  TASK_DEADLINE: { color: "var(--ev-task)", icon: CheckSquare },
  FOLLOW_UP: { color: "var(--ev-follow-up)", icon: RotateCw },
};
