import { getT } from "@/i18n/server";
import { AuthFrame } from "../auth-frame";
import { AuthI18n } from "../client-i18n";
import { InviteForm } from "../account-forms";

export const metadata = { title: "Accept invitation", referrer: "no-referrer" };

export default async function InvitePage() {
  const { t } = await getT();
  return (
    <AuthFrame title={t("sec.inviteTitle")} subtitle={t("sec.inviteSubtitle")}>
      <AuthI18n><InviteForm /></AuthI18n>
    </AuthFrame>
  );
}
