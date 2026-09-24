"use client";

import { ErrorView } from "@/components/error-view";

/** Module-level boundary: the shell (sidebar, top bar) stays usable; only the page area fails. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView error={error} retry={retry} homeHref="/app" />;
}
