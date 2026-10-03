"use client";

import Link from "next/link";

import { ErrorText, Field, FormMessages, SubmitButton, useServerForm } from "@/components/form";
import { login } from "@/lib/auth/actions";

export function LoginForm({ next, linkError }: { next: string; linkError?: string }) {
  const { state, onSubmit, pending } = useServerForm(login);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="อีเมล" name="email" type="email" autoComplete="username" required />
      <Field label="รหัสผ่าน" name="password" type="password" autoComplete="current-password" required />
      {!state ? <ErrorText>{linkError}</ErrorText> : null}
      <FormMessages state={state} />
      <SubmitButton pending={pending} size="lg" pendingText="กำลังเข้าสู่ระบบ...">
        เข้าสู่ระบบ
      </SubmitButton>
      <Link href="/forgot-password" className="w-fit text-primary underline underline-offset-4">
        ลืมรหัสผ่าน
      </Link>
    </form>
  );
}
