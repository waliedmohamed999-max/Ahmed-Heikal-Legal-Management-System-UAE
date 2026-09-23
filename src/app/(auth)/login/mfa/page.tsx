import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { getStaffContext } from "@/server/auth/session";
import { AuthFrame } from "../../auth-frame";
import { MfaForm } from "../../login-form";
import { mfaAction } from "../../actions";

export const metadata = { title: "Verification" };

export default async function MfaPage() {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/login");
  if (!ctx.mfaRequired || ctx.mfaVerified) redirect("/app");
  const { t } = await getT();
  return (
    <AuthFrame title={t("auth.mfaTitle")} subtitle={t("auth.mfaSubtitle")}>
      <MfaForm action={mfaAction} labels={{ code: t("auth.mfaCode"), submit: t("auth.verify"), error: t("auth.mfaInvalid") }} />
    </AuthFrame>
  );
}
