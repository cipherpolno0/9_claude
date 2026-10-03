"use client";


import { Field, FormMessages, SubmitButton, useServerForm } from "@/components/form";
import { requestPasswordReset } from "@/lib/auth/actions";

export function ForgotForm() {
  const { state, onSubmit, pending } = useServerForm(requestPasswordReset);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="อีเมล" name="email" type="email" autoComplete="username" required />
      <FormMessages state={state} />
      <SubmitButton pending={pending} pendingText="กำลังส่ง...">ส่งลิงก์ตั้งรหัสผ่านใหม่</SubmitButton>
    </form>
  );
}
