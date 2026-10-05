import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InfoText } from "@/components/form";
import { QuestionStatusBadge } from "@/components/question-status-badge";
import { requireQuizManager } from "@/lib/auth/guards";
import { fetchLesson } from "@/lib/quiz-server";

import { LessonEditor } from "./lesson-editor";

export const metadata: Metadata = { title: "แก้ไขบทเรียน" };
export const dynamic = "force-dynamic";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireQuizManager();
  const { id } = await params;
  const lesson = await fetchLesson(id);
  if (!lesson || !lesson.units) notFound();
  const created = Boolean((await searchParams).created);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link
          href={`/app/quiz/lessons?course=${lesson.units.course_id}&unit=${lesson.unit_id}`}
          className="text-primary underline underline-offset-4"
        >
          ← บทเรียนของหน่วย {lesson.units.name}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">แก้ไขบทเรียน</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
        {lesson.units.courses?.name} · {lesson.units.name}
        <QuestionStatusBadge status={lesson.status} isActive={lesson.is_active} />
      </p>
      {created ? (
        <div className="mt-4">
          <InfoText>เพิ่มบทเรียนแล้ว เป็นฉบับร่าง ผู้เรียนยังไม่เห็น เพิ่มเนื้อหา กดบันทึก แล้วจึงกดเผยแพร่</InfoText>
        </div>
      ) : null}
      <LessonEditor
        key={lesson.id}
        lessonId={lesson.id}
        initialTitle={lesson.title}
        initialBlocks={Array.isArray(lesson.blocks) ? lesson.blocks : []}
        status={lesson.status}
        isActive={lesson.is_active}
      />
    </section>
  );
}
