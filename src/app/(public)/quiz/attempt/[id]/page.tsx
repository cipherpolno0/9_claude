import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ATTEMPT_KIND_LABEL, CHOICE_KEYS, CHOICE_LABEL, QUIZ_BASE, courseSlug, durationText, type ChoiceKey } from "@/lib/quiz";
import { fetchAttempt, type Attempt, type AttemptQuestion } from "@/lib/quiz-learn-server";
import { cn } from "@/lib/utils";

import { QuizRunner } from "./quiz-runner";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ทำแบบทดสอบ", robots: { index: false } };

const n = (value: number) => value.toLocaleString("th-TH");

export default async function QuizAttemptPage({ params }: Props) {
  const { id } = await params;
  // ไม่พบ หรือไม่ใช่ของผู้เรียก (คนละบัญชี คนละเครื่อง) = หน้าไม่พบ
  const data = await fetchAttempt(id);
  if (!data) notFound();
  const { attempt, questions } = data;
  const courseHref = `${QUIZ_BASE}/${courseSlug(attempt)}`;
  const backHref = attempt.unit_id ? `${courseHref}/${attempt.unit_id}` : courseHref;
  const backLabel = attempt.unit_name ?? attempt.course_name;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <p>
        <Link href={backHref} className="text-primary underline underline-offset-4">
          ← {backLabel}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">{ATTEMPT_KIND_LABEL[attempt.kind]}</h1>
      <p className="mt-1 mb-4 text-muted-foreground">
        {attempt.course_name}
        {attempt.unit_name ? ` · ${attempt.unit_name}` : ""}
      </p>

      {attempt.submitted_at ? (
        <Result attempt={attempt} questions={questions} backHref={backHref} />
      ) : (
        <>
          <p className="mb-4 text-muted-foreground">
            เลือกคำตอบแล้วระบบบันทึกให้ทันที ปิดหน้านี้แล้วกลับมาทำต่อได้
            {attempt.kind === "pre" ? " แบบทดสอบก่อนเรียนยังไม่แสดงเฉลย" : ""}
            {attempt.kind === "full" ? " เวลายังเดินต่อแม้ปิดหน้านี้ หมดเวลาแล้วระบบส่งคำตอบให้อัตโนมัติ" : ""}
          </p>
          <QuizRunner
            key={attempt.id}
            attemptId={attempt.id}
            questions={questions.map((q) => ({
              id: q.question_id,
              text: q.question_text,
              choices: { a: q.choice_a, b: q.choice_b, c: q.choice_c, d: q.choice_d },
            }))}
            initialAnswers={attempt.answers}
            secondsLeft={attempt.seconds_left}
          />
        </>
      )}
    </section>
  );
}

function Result({ attempt, questions, backHref }: { attempt: Attempt; questions: AttemptQuestion[]; backHref: string }) {
  const score = attempt.score ?? 0;
  const percent = attempt.total > 0 ? Math.round((score / attempt.total) * 100) : 0;
  const showKey = attempt.kind !== "pre";
  const timedOut = attempt.expires_at !== null && attempt.submitted_at !== null && attempt.submitted_at >= attempt.expires_at;

  // คะแนนแยกตามหน่วย (เฉพาะการทดสอบรวม)
  const byUnit = new Map<string, { right: number; total: number }>();
  if (attempt.kind === "full") {
    for (const q of questions) {
      const name = q.unit_name ?? "-";
      const row = byUnit.get(name) ?? { right: 0, total: 0 };
      row.total += 1;
      if (q.correct_choice && attempt.answers[q.question_id] === q.correct_choice) row.right += 1;
      byUnit.set(name, row);
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="quiz-result">
      <div className="rounded-xl border-2 border-primary/40 bg-secondary p-5 text-center">
        <p className="text-muted-foreground">คะแนนที่ได้</p>
        <p className="text-4xl font-bold text-primary" data-testid="quiz-score">
          {n(score)}/{n(attempt.total)}
        </p>
        <p className="mt-1">
          คิดเป็นร้อยละ {n(percent)} · ใช้เวลา {durationText(attempt.duration_seconds)}
          {timedOut ? " (หมดเวลา ระบบส่งคำตอบให้อัตโนมัติ)" : ""}
        </p>
      </div>

      {attempt.kind === "pre" ? (
        <div className="rounded-xl border bg-card p-5">
          <p className="text-lg">
            แบบทดสอบก่อนเรียนยังไม่แสดงเฉลย ขั้นต่อไปคืออ่านบทเรียน ระบบจัดหัวข้อที่ตอบผิดไว้บนสุดให้แล้ว
            เฉลยและคำอธิบายจะแสดงหลังทำแบบทดสอบหลังเรียน
          </p>
          <div className="mt-3">
            <Button asChild className="min-h-12 w-full px-6 text-lg sm:w-auto">
              <Link href={`${backHref}/lessons`}>ไปบทเรียน</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {byUnit.size > 0 ? (
        <div className="overflow-x-auto rounded-xl border bg-card" data-testid="unit-scores">
          <table className="w-full border-collapse text-left">
            <caption className="border-b bg-secondary px-4 py-2 text-left font-bold text-primary">คะแนนแยกตามหน่วยการเรียน</caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="px-4 py-2">หน่วยการเรียน</th>
                <th scope="col" className="w-32 px-4 py-2 text-right">ตอบถูก</th>
              </tr>
            </thead>
            <tbody>
              {[...byUnit.entries()].map(([name, row]) => (
                <tr key={name} className="border-b last:border-b-0">
                  <td className="px-4 py-2">{name}</td>
                  <td className="px-4 py-2 text-right">
                    {n(row.right)}/{n(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {showKey ? (
        <div>
          <h2 className="text-xl font-bold text-primary">เฉลยและคำอธิบาย</h2>
          <ol className="mt-3 flex flex-col gap-4" data-testid="answer-key">
            {questions.map((q) => {
              const mine = attempt.answers[q.question_id] as ChoiceKey | undefined;
              const right = Boolean(q.correct_choice) && mine === q.correct_choice;
              return (
                <li key={q.question_id} data-right={right ? "1" : "0"} className="rounded-xl border bg-card p-4">
                  <p className="font-semibold whitespace-pre-line">
                    {n(q.position)}. {q.question_text}
                  </p>
                  <p className={cn("mt-1 font-semibold", right ? "text-green-800" : "text-destructive")}>
                    {right ? "ตอบถูก" : mine ? "ตอบผิด" : "ไม่ได้ตอบ"}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {CHOICE_KEYS.map((key) => {
                      const isCorrect = q.correct_choice === key;
                      const isMine = mine === key;
                      return (
                        <li
                          key={key}
                          className={cn(
                            "rounded-lg border px-3 py-2",
                            isCorrect ? "border-green-600 bg-green-50" : isMine ? "border-destructive bg-destructive/5" : "border-transparent",
                          )}
                        >
                          <span className="font-semibold">{CHOICE_LABEL[key]}.</span> {q[`choice_${key}`]}
                          {isCorrect ? <span className="ml-2 font-semibold text-green-800">ข้อถูก</span> : null}
                          {isMine ? <span className="ml-2 text-muted-foreground">(คำตอบของท่าน)</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                  {q.explanation ? (
                    <p className="mt-2 rounded-lg bg-secondary px-3 py-2 whitespace-pre-line">
                      <span className="font-semibold">คำอธิบาย: </span>
                      {q.explanation}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {attempt.kind === "post" ? (
          <Button asChild className="min-h-12 w-full px-6 text-lg sm:w-auto">
            <Link href={`${backHref}/result`}>ดูสรุปผลก่อนเรียนเทียบหลังเรียน</Link>
          </Button>
        ) : null}
        <Button asChild variant={attempt.kind === "full" ? "default" : "outline"} className="min-h-12 w-full px-6 text-lg sm:w-auto">
          <Link href={backHref}>{attempt.unit_id ? "กลับไปหน้าหน่วยการเรียน" : "กลับไปหน้ารายวิชา"}</Link>
        </Button>
      </div>
    </div>
  );
}
