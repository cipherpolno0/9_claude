import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { LessonContent } from "@/components/lesson-content";
import { Button } from "@/components/ui/button";
import { QUIZ_BASE, courseSlug } from "@/lib/quiz";
import { fetchUnitLessons, fetchUnitState } from "@/lib/quiz-learn-server";

type Props = { params: Promise<{ course: string; unit: string }> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "บทเรียน" };

const n = (value: number) => value.toLocaleString("th-TH");

export default async function QuizLessonsPage({ params }: Props) {
  const { unit: unitId } = await params;
  const state = await fetchUnitState(unitId);
  if (!state) notFound();
  const unitHref = `${QUIZ_BASE}/${courseSlug(state)}/${state.unit_id}`;
  const hasQuiz = state.has_mcq && state.question_count > 0;
  // ยังไม่ส่งแบบทดสอบก่อนเรียน = ยังเปิดบทเรียนไม่ได้ (ฐานข้อมูลก็ไม่คืนบทเรียนให้เช่นกัน)
  if (hasQuiz && !state.pre_submitted) redirect(unitHref);
  const lessons = await fetchUnitLessons(state.unit_id);
  const review = lessons.filter((l) => l.wrong_count > 0).length;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p>
        <Link href={unitHref} className="text-primary underline underline-offset-4">
          ← {state.unit_name}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">บทเรียน: {state.unit_name}</h1>
      {review > 0 ? (
        <p className="mt-2 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3" data-testid="review-note">
          จากแบบทดสอบก่อนเรียน มี {n(review)} หัวข้อที่ควรทบทวน ระบบยกไว้บนสุดให้แล้ว
        </p>
      ) : null}

      {lessons.length === 0 ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground">หน่วยนี้ยังไม่มีบทเรียน</p>
      ) : (
        <>
          <nav aria-label="หัวข้อบทเรียน" className="mt-6 rounded-xl border bg-card p-5">
            <h2 className="font-bold text-primary">หัวข้อในหน่วยนี้</h2>
            <ol className="mt-2 list-decimal pl-6">
              {lessons.map((l) => (
                <li key={l.id}>
                  <a href={`#lesson-${l.id}`} className="text-primary underline underline-offset-4">
                    {l.title}
                  </a>
                  {l.wrong_count > 0 ? <span className="text-amber-800"> (ควรทบทวน)</span> : null}
                </li>
              ))}
            </ol>
          </nav>
          <div className="mt-6 flex flex-col gap-6" data-testid="lesson-list">
            {lessons.map((l) => (
              <article
                key={l.id}
                id={`lesson-${l.id}`}
                data-lesson={l.title}
                data-wrong={l.wrong_count}
                className="scroll-mt-24 rounded-xl border bg-card p-5"
              >
                <h2 className="text-xl font-bold text-primary">{l.title}</h2>
                {l.wrong_count > 0 ? (
                  <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-100 px-3 py-0.5 text-sm font-semibold text-amber-900">
                    <AlertTriangle aria-hidden className="size-4" />
                    ควรทบทวน: ตอบผิด {n(l.wrong_count)} ข้อในแบบทดสอบก่อนเรียน
                  </p>
                ) : null}
                <div className="mt-3">
                  <LessonContent blocks={l.blocks} />
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <div className="mt-8">
        <Button asChild className="min-h-12 w-full px-6 text-lg sm:w-auto">
          <Link href={unitHref}>{hasQuiz ? "อ่านจบแล้ว ไปแบบทดสอบหลังเรียน" : "กลับไปหน้าหน่วยการเรียน"}</Link>
        </Button>
      </div>
    </section>
  );
}
