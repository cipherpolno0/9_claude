"use client";

import Link from "next/link";

import { Field, FormMessages, SubmitButton, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { changePassword } from "@/lib/auth/actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/config";

export function PasswordForm() {
  const { state, onSubmit, pending } = useServerForm(changePassword);
  if (state?.message) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessages state={state} />
        <Button asChild className="w-fit">
          <Link href="/app">เข้าพื้นที่ทำงาน</Link>
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        label="รหัสผ่านใหม่"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={`อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร มีทั้งตัวอักษรอังกฤษและตัวเลข`}
      />
      <Field label="ยืนยันรหัสผ่านใหม่" name="confirm" type="password" autoComplete="new-password" required />
      <FormMessages state={state} />
      <SubmitButton pending={pending} pendingText="กำลังบันทึก...">
        บันทึกรหัสผ่านใหม่
      </SubmitButton>
    </form>
  );
}
