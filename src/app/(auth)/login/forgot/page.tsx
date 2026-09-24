import { getT } from "@/i18n/server";
import { AuthFrame } from "../../auth-frame";
import { AuthI18n } from "../../client-i18n";
import { ForgotForm } from "../../account-forms";

export const metadata = { title: "Reset password" };

export default async function ForgotPage() {
  const { t } = await getT();
  return (
    <AuthFrame title={t("sec.forgotTitle")} subtitle={t("sec.forgotSubtitle")}>
      <AuthI18n><ForgotForm /></AuthI18n>
    </AuthFrame>
  );
}
