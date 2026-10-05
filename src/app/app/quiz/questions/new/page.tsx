import type { Metadata } from "next";
import Link from "next/link";

import { requireQuizManager } from "@/lib/auth/guards";
import { isUuid } from "@/lib/persons-server";
import { fetchCourses, fetchUnits } from "@/lib/quiz-server";

import { QuestionForm } from "../question-form";

export const metadata: Metadata = { title: "เพิ่มข้อสอบ" };
export const dynamic = "force-dynamic";

export default async function NewQuestionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireQuizManager();
  const query = await searchParams;
  const [courses, units] = await Promise.all([fetchCourses(), fetchUnits()]);
  const mcq = courses.filter((c) => c.has_mcq);
  // เปิดจากหน้ารายการที่กรองรายวิชาหรือหน่วยอยู่ = เลือกให้ล่วงหน้า
  const course = typeof query.course === "string" && isUuid(query.course) && mcq.some((c) => c.id === query.course) ? query.course : "";
  const unit =
    course && typeof query.unit === "string" && units.some((u) => u.id === query.unit && u.course_id === course) ? query.unit : "";

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/quiz/questions" className="text-primary underline underline-offset-4">
          ← จัดการข้อสอบ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">เพิ่มข้อสอบ</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        ข้อที่เพิ่มใหม่เป็นฉบับร่าง ผู้เรียนยังไม่เห็น บันทึกแล้วระบบจะพาไปหน้าดูตัวอย่างเพื่อกดเผยแพร่
      </p>
      <QuestionForm
        question={{
          id: "",
          course_id: course,
          unit_id: unit,
          question_text: "",
          choice_a: "",
          choice_b: "",
          choice_c: "",
          choice_d: "",
          correct_choice: "",
          explanation: "",
          source_year_be: null,
          difficulty: "medium",
        }}
        courses={mcq}
        units={units}
        backHref="/app/quiz/questions"
      />
    </section>
  );
}
