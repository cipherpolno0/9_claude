import type { Metadata } from "next";
import Link from "next/link";

import { InfoText } from "@/components/form";
import { requireLogin } from "@/lib/auth/guards";

import { MfaEnroll, MfaRemove, MfaVerify } from "./mfa-forms";

export const metadata: Metadata = { title: "ยืนยันตัวตน 2 ขั้น" };
export const dynamic = "force-dynamic";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const ctx = await requireLogin();
  const { done } = await searchParams;
  const verifiedNow = ctx.aal === "aal2";

  return (
    <section className="mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ยืนยันตัวตน 2 ขั้น</h1>
      <p className="mt-1 text-muted-foreground">
        ใช้รหัส 6 หลักจากแอป Authenticator (เช่น Google Authenticator หรือ Microsoft Authenticator) ร่วมกับรหัสผ่าน
      </p>
      <div className="mt-6 flex flex-col gap-4 rounded-xl border bg-card p-5">
        {ctx.mfaRequired && !verifiedNow ? (
          <p className="font-medium text-destructive">บทบาทของท่านต้องยืนยันตัวตน 2 ขั้นก่อนเข้าพื้นที่ทำงาน</p>
        ) : null}

        {verifiedNow ? (
          <>
            <InfoText>{done ? "ยืนยันตัวตน 2 ขั้นสำเร็จ" : "รอบล็อกอินนี้ยืนยันตัวตน 2 ขั้นแล้ว"}</InfoText>
            <Link href="/app" className="w-fit font-semibold text-primary underline underline-offset-4">
              เข้าพื้นที่ทำงาน
            </Link>
            {!ctx.mfaRequired ? <MfaRemove /> : null}
          </>
        ) : ctx.hasVerifiedFactor ? (
          <MfaVerify next="/app" />
        ) : (
          <MfaEnroll />
        )}
      </div>
      <p className="mt-4">
        <Link href="/account" className="text-primary underline underline-offset-4">
          กลับไปหน้าบัญชีของฉัน
        </Link>
      </p>
    </section>
  );
}
