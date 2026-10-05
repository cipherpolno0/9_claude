import type { Metadata } from "next";
import Link from "next/link";

import { requireQuizManager } from "@/lib/auth/guards";
import { COURSE_LEVELS, COURSE_LEVEL_LABEL, COURSE_STAGE_LABEL, COURSE_SUBJECT_LABEL } from "@/lib/quiz";
import { fetchBankSummary } from "@/lib/quiz-server";

import { QuizNav } from "../quiz-nav";

export const metadata: Metadata = { title: "รายวิชาและหน่วยการเรียน" };
export const dynamic = "force-dynamic";

const n = (value: number) => value.toLocaleString("th-TH");

export default async function CoursesPage() {
  await requireQuizManager();
  const courses = await fetchBankSummary();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">รายวิชาและหน่วยการเรียน</h1>
      <p className="mt-1 text-muted-foreground">
        รายวิชาธรรมศึกษา {n(courses.length)} รายวิชา (ชั้น x ช่วงชั้น x วิชา) กดที่ชื่อรายวิชาเพื่อจัดการหน่วยการเรียน
        วิชากระทู้ธรรมเป็นข้อเขียน จึงไม่มีข้อสอบปรนัย
      </p>
      <QuizNav current="courses" />

      {COURSE_LEVELS.map((level) => (
        <div key={level} className="mt-5 overflow-x-auto rounded-xl border bg-card" data-testid={`courses-${level}`}>
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <caption className="border-b bg-secondary px-4 py-2 text-left text-lg font-bold text-primary">
              {COURSE_LEVEL_LABEL[level]}
            </caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="px-4 py-2">รหัส</th>
                <th scope="col" className="px-4 py-2">รายวิชา</th>
                <th scope="col" className="px-4 py-2">ช่วงชั้น</th>
                <th scope="col" className="px-4 py-2">วิชา</th>
                <th scope="col" className="px-4 py-2 text-right">หน่วย</th>
                <th scope="col" className="px-4 py-2 text-right">ข้อสอบ</th>
              </tr>
            </thead>
            <tbody>
              {courses
                .filter((c) => c.level === level)
                .map((c) => (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2 whitespace-nowrap">{c.code}</td>
                    <td className="px-4 py-2">
                      <Link href={`/app/quiz/courses/${c.id}`} className="font-semibold text-primary underline underline-offset-4">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{COURSE_STAGE_LABEL[c.stage]}</td>
                    <td className="px-4 py-2">{COURSE_SUBJECT_LABEL[c.subject]}</td>
                    <td className="px-4 py-2 text-right">{n(c.units.length)}</td>
                    <td className="px-4 py-2 text-right">
                      {c.has_mcq ? n(c.published + c.draft) : <span className="text-muted-foreground">ข้อเขียน</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
