import { redirect } from "next/navigation";
import Link from "next/link";
import { getT } from "@/i18n/server";
import { getStaffContext } from "@/server/auth/session";
import { AuthFrame } from "../auth-frame";
import { LoginForm } from "../login-form";
import { staffLoginAction } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const ctx = await getStaffContext();
  if (ctx && (!ctx.mfaRequired || ctx.mfaVerified)) redirect("/app");
  const { t } = await getT();
  const { next } = await searchParams;
  return (
    <AuthFrame title={t("auth.signInTitle")} subtitle={t("auth.signInSubtitle")}>
      <LoginForm
        action={staffLoginAction}
        next={next}
        labels={{
          email: t("auth.email"),
          password: t("auth.password"),
          submit: t("auth.signIn"),
          submitting: t("auth.signingIn"),
          errors: { invalid: t("auth.invalid"), locked: t("auth.locked"), rateLimited: t("errors.rateLimited") },
        }}
      />
      <p className="mt-8 text-center text-body text-ink-subtle">
        <Link href="/portal/login" className="hover:text-ink hover:underline">
          {t("auth.clientLogin")}
        </Link>
      </p>
    </AuthFrame>
  );
}
