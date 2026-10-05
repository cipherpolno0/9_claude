import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QUIZ_BASE, courseSlug } from "@/lib/quiz";
import { fetchUnitState } from "@/lib/quiz-learn-server";
import { cn } from "@/lib/utils";

import { StartQuizButton } from "../../start-button";

type Props = { params: Promise<{ course: string; unit: string }> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "เส้นทางเรียนของหน่วย" };

const n = (value: number) => value.toLocaleString("th-TH");

function Step({
  number,
  title,
  state,
  children,
}: {
  number: number;
  title: string;
  state: "done" | "current" | "locked";
  children: React.ReactNode;
}) {
  return (
    <li
      data-step={number}
      data-state={state}
      className={cn(
        "rounded-xl border-2 bg-card p-5",
        state === "current" ? "border-primary" : state === "done" ? "border-green-300" : "border-input opacity-80",
      )}
    >
      <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold text-primary">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">{n(number)}</span>
        {title}
        {state === "done" ? <CheckCircle2 aria-label="เสร็จแล้ว" className="size-6 text-green-700" /> : null}
        {state === "locked" ? <Lock aria-label="ยังไม่เปิด" className="size-5 text-muted-foreground" /> : null}
      </h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </li>
  );
}

export default async function QuizUnitPage({ params }: Props) {
  const { course: slug, unit: unitId } = await params;
  const state = await fetchUnitState(unitId);
  if (!state) notFound();
  const realSlug = courseSlug(state);
  if (slug !== realSlug) redirect(`${QUIZ_BASE}/${realSlug}/${state.unit_id}`);

  const base = `${QUIZ_BASE}/${realSlug}`;
  const hasQuiz = state.has_mcq && state.question_count > 0;
  const perQuiz = Math.min(state.per_quiz, state.question_count);
  const preDone = Boolean(state.pre_submitted);
  const lessonsOpen = !hasQuiz || preDone;
  const lessonsDone = Boolean(state.lessons_opened) || (preDone && state.lesson_count === 0);
  const postReady = preDone && (state.lesson_count === 0 || Boolean(state.lessons_opened));
  const postDone = state.post_done_count > 0;
  const postOpen = Boolean(state.post_id) && !state.post_submitted;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p>
        <Link href={base} className="text-primary underline underline-offset-4">
          ← {state.course_name}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">{state.unit_name}</h1>
      <p className="mt-1 text-muted-foreground">
        {hasQuiz
          ? "ทำตามลำดับ: แบบทดสอบก่อนเรียน > บทเรียน > แบบทดสอบหลังเรียน"
          : state.has_mcq
            ? "หน่วยนี้ยังไม่มีข้อสอบ เปิดอ่านบทเรียนได้ทันที"
            : "วิชานี้เป็นข้อเขียน มีเฉพาะบทเรียน เปิดอ่านได้ทันที"}
      </p>

      <ol className="mt-6 flex flex-col gap-4" data-testid="unit-steps">
        {hasQuiz ? (
          <Step number={1} title="แบบทดสอบก่อนเรียน" state={preDone ? "done" : "current"}>
            {preDone ? (
              <>
                <p data-testid="pre-result">
                  ทำแล้ว ได้ <strong>{n(state.pre_score ?? 0)}/{n(state.pre_total ?? 0)}</strong> คะแนน
                  (แบบทดสอบก่อนเรียนยังไม่แสดงเฉลย ดูเฉลยได้ในแบบทดสอบหลังเรียน)
                </p>
              </>
            ) : state.pre_id ? (
              <>
                <p>ทำค้างไว้ ตอบแล้ว {n(state.pre_answered ?? 0)}/{n(state.pre_total ?? 0)} ข้อ คำตอบเดิมยังอยู่ครบ</p>
                <StartQuizButton kind="pre" unitId={state.unit_id}>
                  ทำแบบทดสอบก่อนเรียนต่อ
                </StartQuizButton>
              </>
            ) : (
              <>
                <p>สุ่ม {n(perQuiz)} ข้อจากหน่วยนี้ เพื่อดูว่าควรทบทวนหัวข้อใด ยังไม่แสดงเฉลย</p>
                <StartQuizButton kind="pre" unitId={state.unit_id}>
                  เริ่มแบบทดสอบก่อนเรียน
                </StartQuizButton>
              </>
            )}
          </Step>
        ) : null}

        <Step
          number={hasQuiz ? 2 : 1}
          title="บทเรียน"
          state={!lessonsOpen ? "locked" : lessonsDone && hasQuiz ? "done" : "current"}
        >
          {state.lesson_count === 0 ? (
            <p className="text-muted-foreground">หน่วยนี้ยังไม่มีบทเรียน{hasQuiz ? " ข้ามไปทำแบบทดสอบหลังเรียนได้เลย" : ""}</p>
          ) : !lessonsOpen ? (
            <p className="text-muted-foreground">เปิดหลังส่งแบบทดสอบก่อนเรียน ({n(state.lesson_count)} หัวข้อ)</p>
          ) : (
            <>
              <p>
                บทเรียน {n(state.lesson_count)} หัวข้อ{hasQuiz ? " หัวข้อที่ตอบผิดในแบบทดสอบก่อนเรียนจะอยู่บนสุด" : ""}
              </p>
              <div>
                <Button asChild className="min-h-12 w-full px-6 text-lg sm:w-auto" variant={lessonsDone && hasQuiz ? "outline" : "default"}>
                  <Link href={`${base}/${state.unit_id}/lessons`}>{lessonsDone && hasQuiz ? "อ่านบทเรียนอีกครั้ง" : "เปิดบทเรียน"}</Link>
                </Button>
              </div>
            </>
          )}
        </Step>

        {hasQuiz ? (
          <Step number={3} title="แบบทดสอบหลังเรียน" state={!postReady ? "locked" : postDone && !postOpen ? "done" : "current"}>
            {!postReady ? (
              <p className="text-muted-foreground">
                {preDone ? "เปิดหลังจากเปิดอ่านบทเรียนแล้ว" : "เปิดหลังส่งแบบทดสอบก่อนเรียน และเปิดอ่านบทเรียนแล้ว"}
              </p>
            ) : (
              <>
                {postDone ? (
                  <p data-testid="post-result">
                    ทำแล้ว {n(state.post_done_count)} ครั้ง คะแนนสูงสุด <strong>{n(state.best_post_score ?? 0)}</strong>
                    {state.post_submitted && state.post_id ? (
                      <>
                        {" "}
                        · ครั้งล่าสุด{" "}
                        <Link href={`${QUIZ_BASE}/attempt/${state.post_id}`} prefetch={false} className="font-semibold text-primary underline underline-offset-4">
                          {n(state.post_score ?? 0)}/{n(state.post_total ?? 0)} คะแนน (ดูเฉลย)
                        </Link>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p>สุ่ม {n(perQuiz)} ข้อชุดใหม่ แสดงเฉลยและคำอธิบายหลังส่งคำตอบ</p>
                )}
                {postOpen ? (
                  <>
                    <p>ทำค้างไว้ ตอบแล้ว {n(state.post_answered ?? 0)}/{n(state.post_total ?? 0)} ข้อ</p>
                    <StartQuizButton kind="post" unitId={state.unit_id}>
                      ทำแบบทดสอบหลังเรียนต่อ
                    </StartQuizButton>
                  </>
                ) : (
                  <StartQuizButton kind="post" unitId={state.unit_id} variant={postDone ? "outline" : "default"}>
                    {postDone ? "ทำแบบทดสอบหลังเรียนอีกครั้ง (สุ่มชุดใหม่)" : "เริ่มแบบทดสอบหลังเรียน"}
                  </StartQuizButton>
                )}
              </>
            )}
          </Step>
        ) : null}
      </ol>

      {hasQuiz && preDone ? (
        <p className="mt-6">
          <Link href={`${base}/${state.unit_id}/result`} className="text-lg font-semibold text-primary underline underline-offset-4">
            ดูสรุปผลของหน่วยนี้ (ก่อนเรียนเทียบหลังเรียน)
          </Link>
        </p>
      ) : null}

      {hasQuiz && postDone && !postOpen ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <p className="font-semibold">ต้องการเรียนหน่วยนี้ใหม่ตั้งแต่ต้น?</p>
          <p className="text-muted-foreground">เริ่มรอบใหม่จากแบบทดสอบก่อนเรียน ผลของรอบก่อนยังเก็บอยู่ในประวัติ</p>
          <div className="mt-3">
            <StartQuizButton
              kind="pre"
              unitId={state.unit_id}
              restart
              variant="outline"
              confirmText="เริ่มเรียนหน่วยนี้ใหม่ตั้งแต่แบบทดสอบก่อนเรียนใช่หรือไม่"
            >
              เริ่มเรียนหน่วยนี้ใหม่
            </StartQuizButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}
