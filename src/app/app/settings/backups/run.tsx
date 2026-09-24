"use client";

import { useRouter } from "next/navigation";
import { DatabaseBackup } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/forms";
import { runBackupAction } from "./actions";

export function RunBackup() {
  const { t } = useI18n();
  const router = useRouter();
  const { run, pending } = useAction();
  return (
    <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => runBackupAction({}), { onSuccess: () => router.refresh() })}>
      <DatabaseBackup /> {t("settings.backups.runNow")}
    </Button>
  );
}
