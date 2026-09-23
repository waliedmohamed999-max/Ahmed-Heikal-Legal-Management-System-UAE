import { requireStaff } from "@/server/auth/session";
import { listSessions } from "@/server/services/admin";
import { ProfileView } from "./view";

export default async function ProfilePage() {
  const ctx = await requireStaff();
  const sessions = await listSessions(ctx, ctx.user.id);
  return (
    <ProfileView
      mfaEnabled={ctx.user.mfaEnabled}
      currentSession={ctx.sessionId}
      user={{ name: ctx.user.name, email: ctx.user.email, role: ctx.role.name }}
      sessions={sessions.map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString() }))}
    />
  );
}
