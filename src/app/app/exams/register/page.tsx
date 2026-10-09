import type { Metadata } from "next";
import Link from "next/link";

import { requireMenu } from "@/lib/auth/guards";
import { fetchRegisterRounds } from "@/lib/exam-forms-server";

import { RegisterWizard } from "./register-wizard";

export const metadata: Metadata = { title: "สมัครสอบ: ดาวน์โหลดแม่แบบบัญชี ศ." };
export const dynamic = "force-dynamic";

export default async function ExamRegisterPage() {
  await requireMenu("/app/exams");
  const rounds = await fetchRegisterRounds();

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams" className="text-primary underline underline-offset-4">
          สมัครสอบและผลสอบ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">สมัครสอบ: ดาวน์โหลดแม่แบบบัญชี ศ.</h1>
      <p className="mt-1 text-muted-foreground">
        เลือกตามลำดับ 3 ขั้น แล้วดาวน์โหลดแม่แบบ Excel ที่เติมปี รหัสสนามสอบ ชื่อสนามสอบ และที่ตั้งไว้แล้ว
        หนึ่งแฟ้มต่อหนึ่งสนามสอบและหนึ่งชั้น วิธีกรอกดูได้ที่{" "}
        <Link href="/downloads/guide" prefetch={false} className="text-primary underline underline-offset-4">
          คู่มือการกรอก
        </Link>
      </p>
      <RegisterWizard rounds={rounds} />
    </section>
  );
}
