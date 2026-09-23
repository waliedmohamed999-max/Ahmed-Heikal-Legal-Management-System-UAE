"use client";

import { useTransition } from "react";
import { useForm, type DefaultValues, type FieldValues, type Path, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { useI18n } from "@/i18n/client";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * RHF + zod on the client, the same schema re-validated by the server action.
 * Server field errors are mapped back onto inputs; messages are i18n keys.
 */
export function useServerForm<S extends z.ZodType<FieldValues, FieldValues>, R>(opts: {
  schema: S;
  defaultValues: DefaultValues<z.input<S>>;
  action: (values: z.input<S>) => Promise<ActionResult<R>>;
  onSuccess?: (data: R) => void;
  successMessage?: string;
}) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const form = useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(opts.schema as never) as unknown as Resolver<z.input<S>, unknown, z.output<S>>,
    defaultValues: opts.defaultValues,
    mode: "onTouched",
  });

  const submit = form.handleSubmit(() => {
    // Send the raw input: the server parses it with the same schema.
    const values = form.getValues();
    start(async () => {
      try {
        const res = await opts.action(values);
        if (res.ok) {
          if (opts.successMessage) toast.success(opts.successMessage);
          opts.onSuccess?.(res.data);
        } else {
          if (res.fieldErrors) {
            for (const [k, v] of Object.entries(res.fieldErrors)) form.setError(k as Path<z.input<S>>, { message: v });
          }
          toast.error(t(`errors.${res.error}`));
        }
      } catch {
        toast.error(t("errors.network"));
      }
    });
  });

  /** Translated error for a field path. */
  const err = (name: string): string | undefined => {
    const parts = name.split(".");
    let e: unknown = form.formState.errors;
    for (const p of parts) e = (e as Record<string, unknown> | undefined)?.[p];
    const msg = (e as { message?: string } | undefined)?.message;
    return msg ? t(`validation.${msg}`) : undefined;
  };

  return { form, submit, pending, err };
}

/** Run a one-off server action with toast feedback. */
export function useAction() {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const run = <T,>(fn: () => Promise<ActionResult<T>>, opts?: { success?: string; onSuccess?: (d: T) => void }) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          if (opts?.success) toast.success(opts.success);
          opts?.onSuccess?.(r.data);
        } else toast.error(t(`errors.${r.error}`));
      } catch {
        toast.error(t("errors.network"));
      }
    });
  return { run, pending };
}
