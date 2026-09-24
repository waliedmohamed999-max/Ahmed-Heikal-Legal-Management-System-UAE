import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { getStaffContext } from "@/server/auth/session";
import { AuthFrame } from "../../auth-frame";
import { AuthI18n } from "../../client-i18n";
import { MfaSetupForm } from "../../account-forms";

export const metadata = { title: "Set up two-step verification" };

/** Forced enrolment: reached when the user's role requires MFA and none is set up yet. */
export default async function MfaSetupPage() {
  const ctx = await getStaffContext();
  if (!ctx) redirect("/login");
  if (!ctx.mfaEnrollmentRequired) redirect("/app");
  const { t } = await getT();
  return (
    <AuthFrame title={t("sec.mfaSetupTitle")} subtitle={t("sec.mfaSetupSubtitle")}>
      <AuthI18n><MfaSetupForm /></AuthI18n>
    </AuthFrame>
  );
}
