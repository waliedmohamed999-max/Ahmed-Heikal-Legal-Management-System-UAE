"use client";

import { ErrorView } from "@/components/error-view";

export default function PortalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView error={error} retry={retry} homeHref="/portal" />;
}
