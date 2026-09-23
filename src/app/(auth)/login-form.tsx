"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import type { FormState } from "./actions";

type Labels = { email: string; password: string; submit: string; submitting: string; errors: Record<string, string> };

export function LoginForm({ action, labels, next }: { action: (s: FormState, f: FormData) => Promise<FormState>; labels: Labels; next?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {state?.error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {labels.errors[state.error] ?? labels.errors.invalid}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{labels.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required dir="ltr" className="h-10" autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{labels.password}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" className="h-10" />
      </div>
      <Button type="submit" variant="primary" size="lg" loading={pending} className="mt-1 w-full">
        {pending ? labels.submitting : labels.submit}
      </Button>
    </form>
  );
}

export function MfaForm({ action, labels }: { action: (s: FormState, f: FormData) => Promise<FormState>; labels: { code: string; submit: string; error: string } }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && (
        <div role="alert" className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          {labels.error}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">{labels.code}</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={7}
          required
          dir="ltr"
          className="h-11 text-center font-mono text-lg tracking-[0.4em]"
          autoFocus
        />
      </div>
      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        {labels.submit}
      </Button>
    </form>
  );
}
