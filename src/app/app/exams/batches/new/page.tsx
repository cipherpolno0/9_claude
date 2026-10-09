import type { Metadata } from "next";
import Link from "next/link";

import { requireMenu } from "@/lib/auth/guards";
import { uploadLimits } from "@/lib/exam-batches-server";
import { fetchRegisterRounds } from "@/lib/exam-forms-server";

import { RegisterWizard } from "../../register/register-wizard";

export const metadata: Metadata = { title: "อัปโหลดรายชื่อผู้สมัครสอบ" };
export const dynamic = "force-dynamic";

export default async function NewBatchPage() {
  await requireMenu("/app/exams");
  const [rounds, limits] = await Promise.all([fetchRegisterRounds(), uploadLimits()]);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams" className="text-primary underline underline-offset-4">
          สมัครสอบและผลสอบ
        </Link>{" "}
        /{" "}
        <Link href="/app/exams/batches" className="text-primary underline underline-offset-4">
          ชุดรายชื่อผู้สมัครสอบ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">อัปโหลดรายชื่อผู้สมัครสอบ</h1>
      <p className="mt-1 text-muted-foreground">
        เลือกรอบ สำนักหรือสถานศึกษา และสนามสอบ ให้ตรงกับไฟล์ แล้วอัปโหลดไฟล์บัญชี ศ. ที่กรอกแล้ว ระบบจะตรวจทุกแถวและแสดงตัวอย่างก่อนยืนยัน
        ยังไม่มีแม่แบบ?{" "}
        <Link href="/app/exams/register" prefetch={false} className="text-primary underline underline-offset-4">
          ดาวน์โหลดแม่แบบ
        </Link>
      </p>
      <RegisterWizard rounds={rounds} mode="upload" limits={limits} />
    </section>
  );
}
