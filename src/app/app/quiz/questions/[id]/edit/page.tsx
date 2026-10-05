import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireQuizManager } from "@/lib/auth/guards";
import { fetchCourses, fetchLessonOptions, fetchQuestion, fetchUnits } from "@/lib/quiz-server";

import { QuestionForm } from "../../question-form";

export const metadata: Metadata = { title: "แก้ไขข้อสอบ" };
export const dynamic = "force-dynamic";

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireQuizManager();
  const { id } = await params;
  const question = await fetchQuestion(id);
  if (!question) notFound();
  const [courses, units, lessons] = await Promise.all([fetchCourses(), fetchUnits(), fetchLessonOptions()]);
  // หน่วยเดิมของข้อนี้อาจถูกปิดใช้งานไปแล้ว ให้ยังเลือกค้างไว้ได้
  const allUnits =
    question.units && !units.some((u) => u.id === question.unit_id)
      ? [...units, { id: question.unit_id, course_id: question.course_id, name: question.units.name, sort_order: 9999, is_active: false }]
      : units;

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/quiz/questions/${question.id}`} className="text-primary underline underline-offset-4">
          ← กลับไปหน้าดูตัวอย่าง
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">แก้ไขข้อสอบ</h1>
      <p className="mt-1 mb-6 text-muted-foreground">
        {question.status === "published"
          ? "ข้อนี้เผยแพร่แล้ว การแก้ไขจะมีผลกับผู้เรียนทันทีที่บันทึก"
          : "ข้อนี้เป็นฉบับร่าง ผู้เรียนยังไม่เห็น"}
      </p>
      <QuestionForm
        question={question}
        courses={courses.filter((c) => c.has_mcq)}
        units={allUnits}
        lessons={lessons}
        backHref={`/app/quiz/questions/${question.id}`}
      />
    </section>
  );
}
