import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { getClientContext } from "@/server/auth/session";
import { AuthFrame } from "@/app/(auth)/auth-frame";
import { LoginForm } from "@/app/(auth)/login-form";
import { portalLoginAction } from "@/app/(auth)/actions";

export const metadata = { title: "Client Portal" };

export default async function PortalLoginPage() {
  if (await getClientContext()) redirect("/portal");
  const { t } = await getT();
  return (
    <AuthFrame title={t("auth.portalTitle")} subtitle={t("auth.portalSubtitle")} variant="portal">
      <LoginForm
        action={portalLoginAction}
        labels={{ email: t("auth.email"), password: t("auth.password"), submit: t("auth.signIn"), submitting: t("auth.signingIn"), errors: { invalid: t("auth.invalid"), locked: t("auth.locked"), rateLimited: t("errors.rateLimited") } }}
      />
      <p className="mt-8 text-center text-[13px] text-ink-subtle"><Link href="/login" className="hover:text-ink hover:underline">{t("auth.staffLogin")}</Link></p>
    </AuthFrame>
  );
}
