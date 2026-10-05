import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { COURSE_LEVEL_LABEL, COURSE_STAGE_LABEL, COURSE_SUBJECT_LABEL, QUIZ_BASE, clockText, parseCourseSlug } from "@/lib/quiz";
import { fetchCourseUnits, fetchFullState, isSignedIn } from "@/lib/quiz-learn-server";

import { StartQuizButton } from "../start-button";

type Props = { params: Promise<{ course: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const course = parseCourseSlug((await params).course);
  if (!course) return {};
  return { title: `${COURSE_LEVEL_LABEL[course.level]} ${COURSE_STAGE_LABEL[course.stage]} วิชา${COURSE_SUBJECT_LABEL[course.subject]}` };
}

const n = (value: number) => value.toLocaleString("th-TH");

export default async function QuizCoursePage({ params }: Props) {
  const { course: slug } = await params;
  const course = parseCourseSlug(slug);
  if (!course) notFound();
  const rows = await fetchCourseUnits(course);
  if (rows.length === 0) notFound();
  const info = rows[0];
  const units = rows.filter((r) => r.unit_id);
  const [full, signedIn] = await Promise.all([
    info.has_mcq && info.question_total > 0 ? fetchFullState(info.course_id) : Promise.resolve(null),
    isSignedIn(),
  ]);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href={QUIZ_BASE} className="text-primary underline underline-offset-4">
          ← เลือกชั้นและวิชา
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">{info.course_name}</h1>
      <p className="mt-1 text-muted-foreground">
        {COURSE_LEVEL_LABEL[course.level]} · {COURSE_STAGE_LABEL[course.stage]} · วิชา{COURSE_SUBJECT_LABEL[course.subject]}
        {info.has_mcq ? "" : " (ข้อเขียน มีเฉพาะบทเรียน ไม่มีแบบทดสอบปรนัย)"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {signedIn
          ? "ท่านเข้าสู่ระบบอยู่ ระบบเก็บประวัติการเรียนไว้ในบัญชีของท่าน"
          : "ท่านยังไม่ได้เข้าสู่ระบบ ความคืบหน้าจำไว้ในเครื่องนี้เท่านั้น"}
      </p>

      <h2 className="mt-8 text-xl font-bold text-primary">เลือกหน่วยการเรียน</h2>
      {units.length === 0 ? (
        <p className="mt-3 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="no-units">
          รายวิชานี้ยังไม่เปิดให้เรียน (ยังไม่มีบทเรียนหรือข้อสอบที่เผยแพร่)
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3" data-testid="unit-list">
          {units.map((u, i) => (
            <li key={u.unit_id}>
              <Link
                href={`${QUIZ_BASE}/${slug}/${u.unit_id}`}
                prefetch={false}
                className="flex min-h-16 flex-wrap items-center gap-3 rounded-xl border-2 border-input bg-card px-4 py-3 hover:border-primary"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-primary">
                  {n(i + 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold text-primary">{u.unit_name}</span>
                  <span className="block text-sm text-muted-foreground">
                    บทเรียน {n(u.lesson_count ?? 0)} หัวข้อ
                    {info.has_mcq ? ` · ข้อสอบ ${n(u.question_count ?? 0)} ข้อ` : ""}
                  </span>
                </span>
                {u.post_done ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-100 px-3 py-0.5 text-sm font-semibold text-green-900">
                    <CheckCircle2 aria-hidden className="size-4" />
                    หลังเรียน {n(u.last_post_score ?? 0)}/{n(u.last_post_total ?? 0)}
                  </span>
                ) : u.pre_done ? (
                  <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-0.5 text-sm font-semibold text-amber-900">
                    กำลังเรียน
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ol>
      )}

      {full ? (
        <div className="mt-8 rounded-xl border-2 border-primary/40 bg-secondary p-5" data-testid="full-test">
          <h2 className="text-xl font-bold text-primary">ทดสอบรวมทั้งวิชา</h2>
          <p className="mt-1">
            สุ่ม {n(Math.min(full.per_quiz, full.question_total))} ข้อจากทุกหน่วย จับเวลา {n(full.minutes)} นาที
            หมดเวลาแล้วระบบส่งคำตอบให้อัตโนมัติ แสดงคะแนนและเฉลยหลังส่ง
          </p>
          {full.last_id ? (
            <p className="mt-2">
              ครั้งล่าสุดได้{" "}
              <Link href={`${QUIZ_BASE}/attempt/${full.last_id}`} prefetch={false} className="font-semibold text-primary underline underline-offset-4">
                {n(full.last_score ?? 0)}/{n(full.last_total ?? 0)} คะแนน
              </Link>{" "}
              (ทำแล้ว {n(full.done_count)} ครั้ง)
            </p>
          ) : null}
          <div className="mt-3">
            {full.open_id ? (
              <StartQuizButton kind="full" courseId={info.course_id}>
                ทำต่อ (ตอบแล้ว {n(full.open_answered ?? 0)}/{n(full.open_total ?? 0)} ข้อ เหลือเวลา {clockText(full.open_seconds_left ?? 0)})
              </StartQuizButton>
            ) : (
              <StartQuizButton
                kind="full"
                courseId={info.course_id}
                confirmText={`เริ่มทดสอบรวมทั้งวิชาใช่หรือไม่ เวลา ${full.minutes} นาทีจะเริ่มนับทันที`}
              >
                เริ่มทดสอบรวมทั้งวิชา
              </StartQuizButton>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
