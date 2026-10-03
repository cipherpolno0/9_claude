import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/session";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  if (await getAuthContext()) redirect("/app");

  return (
    <section className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">เข้าสู่ระบบ</h1>
      <p className="mt-1 text-muted-foreground">สำหรับเจ้าหน้าที่และผู้มีบัญชีผู้ใช้</p>
      <div className="mt-6 rounded-xl border bg-card p-5">
        <LoginForm
          next={next ?? "/app"}
          linkError={error === "link" ? "ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่" : undefined}
        />
      </div>
      <p className="mt-4">
        ยังไม่มีบัญชี?{" "}
        <Link href="/request-account" className="font-semibold text-primary underline underline-offset-4">
          ขอบัญชีผู้ใช้
        </Link>
      </p>
    </section>
  );
}
