import type { Metadata } from "next";
import Link from "next/link";

import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "ลืมรหัสผ่าน" };

export default function ForgotPasswordPage() {
  return (
    <section className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ลืมรหัสผ่าน</h1>
      <p className="mt-1 text-muted-foreground">
        กรอกอีเมลที่ใช้เข้าสู่ระบบ ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้
      </p>
      <div className="mt-6 rounded-xl border bg-card p-5">
        <ForgotForm />
      </div>
      <p className="mt-4">
        <Link href="/login" className="text-primary underline underline-offset-4">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </p>
    </section>
  );
}
