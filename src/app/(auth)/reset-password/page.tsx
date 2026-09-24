import { getT } from "@/i18n/server";
import { AuthFrame } from "../auth-frame";
import { AuthI18n } from "../client-i18n";
import { ResetForm } from "../account-forms";

export const metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage() {
  const { t } = await getT();
  return (
    <AuthFrame title={t("sec.resetTitle")} subtitle={t("sec.resetSubtitle")}>
      <AuthI18n><ResetForm /></AuthI18n>
    </AuthFrame>
  );
}
