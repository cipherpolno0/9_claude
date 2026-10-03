import type { Metadata } from "next";
import Link from "next/link";

import { ErrorText } from "@/components/form";
import { requireLogin } from "@/lib/auth/guards";

import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "เปลี่ยนรหัสผ่าน" };
export const dynamic = "force-dynamic";

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const ctx = await requireLogin();
  const { expired } = await searchParams;
  const maxAge = ctx.settings.password_max_age_days ?? 180;

  return (
    <section className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">เปลี่ยนรหัสผ่าน</h1>
      <p className="mt-1 text-muted-foreground">{ctx.user.email}</p>
      <div className="mt-6 flex flex-col gap-4 rounded-xl border bg-card p-5">
        {expired || ctx.passwordExpired ? (
          <ErrorText>รหัสผ่านใช้มาครบ {maxAge} วันแล้ว กรุณาตั้งรหัสผ่านใหม่ก่อนใช้งานต่อ</ErrorText>
        ) : null}
        <PasswordForm />
      </div>
      <p className="mt-4">
        <Link href="/account" className="text-primary underline underline-offset-4">
          กลับไปหน้าบัญชีของฉัน
        </Link>
      </p>
    </section>
  );
}
