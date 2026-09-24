import { I18nProvider } from "@/i18n/client";
import { DICTS, getT } from "@/i18n/server";

/** Client-side translations for the account forms (auth pages render outside the app providers). */
export async function AuthI18n({ children }: { children: React.ReactNode }) {
  const { locale } = await getT();
  return (
    <I18nProvider locale={locale} dict={DICTS[locale]} tz="Asia/Dubai">
      {children}
    </I18nProvider>
  );
}
