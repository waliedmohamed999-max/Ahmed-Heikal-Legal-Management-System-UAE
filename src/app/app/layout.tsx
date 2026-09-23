import { requireStaff } from "@/server/auth/session";
import { getT, DICTS } from "@/i18n/server";
import { db } from "@/server/db";
import { nextHearing } from "@/server/services/dashboard";
import { matterScopeWhere } from "@/server/services/access";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import { QuickCreateHost } from "@/components/quick/quick-create-host";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaff();
  const { locale } = await getT();
  const scope = matterScopeWhere(ctx);
  const [unread, approvals, hearing] = await Promise.all([
    db.notification.count({ where: { userId: ctx.user.id, readAt: null, OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }] } }),
    ctx.can("approvals.view")
      ? db.approval.count({
          where: {
            organizationId: ctx.org.id, status: "PENDING",
            AND: [ctx.can("approvals.decide") ? {} : { assignedToId: ctx.user.id }, { OR: [{ matterId: null }, { matter: scope }] }],
          },
        })
      : 0,
    nextHearing(ctx),
  ]);

  return (
    <Providers locale={locale} dict={DICTS[locale]} tz={ctx.org.timezone}>
      <AppShell
        user={{
          id: ctx.user.id, name: ctx.user.name, nameAr: ctx.user.nameAr, email: ctx.user.email, photoUrl: ctx.user.photoUrl,
          position: ctx.user.position, positionAr: ctx.user.positionAr, role: locale === "ar" ? ctx.role.nameAr || ctx.role.name : ctx.role.name,
        }}
        permissions={[...ctx.principal.permissions]}
        counts={{ unread, approvals }}
        nextHearing={hearing}
        isDemo={ctx.org.isDemo}
      >
        {children}
      </AppShell>
      <QuickCreateHost permissions={[...ctx.principal.permissions]} />
    </Providers>
  );
}
