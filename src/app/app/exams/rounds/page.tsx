import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { fetchExamRounds, fetchFormTemplates } from "@/lib/exam-forms-server";
import { fetchAcademicYears } from "@/lib/venues-server";
import { todayInBangkok } from "@/lib/venues";

import { RoundForm, RoundList } from "./round-manager";

export const metadata: Metadata = { title: "รอบสมัครสอบ" };

export default async function ExamRoundsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds) redirect("/app/exams?denied=1");
  const { edit } = await searchParams;
  const [rounds, years, templates] = await Promise.all([fetchExamRounds(), fetchAcademicYears(), fetchFormTemplates()]);
  const editing = edit ? (rounds.find((r) => r.id === edit && r.is_active) ?? null) : null;
  const formCodes = Object.fromEntries(
    templates.filter((t) => t.is_active).map((t) => [`${t.exam_type}:${t.level}`, t.code]),
  );

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams" className="text-primary underline underline-offset-4">
          สมัครสอบและผลสอบ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">รอบสมัครสอบ</h1>
      <p className="mt-1 text-muted-foreground">
        หนึ่งรอบ = ปีการศึกษา + ประเภท + ชั้น สร้างรอบเป็นร่างก่อน แล้วกด เปิดรับสมัคร ผู้สมัครดาวน์โหลดแม่แบบได้เฉพาะรอบที่เปิดอยู่
        และอยู่ในช่วงวันรับสมัคร ปีการศึกษาเพิ่มได้ที่หน้า ผู้ดูแลระบบ &gt; บทบาทและค่าตั้ง
      </p>

      <RoundForm key={editing?.id ?? "new"} years={years} round={editing} />
      <RoundList rounds={rounds} formCodes={formCodes} today={todayInBangkok()} />
    </section>
  );
}
