"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

import { ErrorText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { CHOICE_KEYS, CHOICE_LABEL, clockText, type ChoiceKey } from "@/lib/quiz";
import { cn } from "@/lib/utils";

import { saveAnswer, submitAttempt } from "../../actions";

export type RunnerQuestion = { id: string; text: string; choices: Record<ChoiceKey, string> };

/**
 * หน้าทำข้อสอบ: ทีละข้อ ปุ่มใหญ่ บันทึกคำตอบทันทีที่เลือก ปิดแล้วกลับมาทำต่อได้
 * ข้อมูลที่ได้รับมีเฉพาะโจทย์และตัวเลือก ไม่มีข้อถูก (การตรวจทำที่ฐานข้อมูลเมื่อส่งคำตอบ)
 */
export function QuizRunner({
  attemptId,
  questions,
  initialAnswers,
  secondsLeft,
}: {
  attemptId: string;
  questions: RunnerQuestion[];
  initialAnswers: Record<string, ChoiceKey>;
  /** เวลาที่เหลือ (วินาที) ของการทดสอบรวม หรือ null ถ้าไม่จับเวลา */
  secondsLeft: number | null;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState(initialAnswers);
  // กลับมาทำต่อ: เริ่มที่ข้อแรกที่ยังไม่ได้ตอบ
  const [index, setIndex] = useState(() => {
    const first = questions.findIndex((q) => !initialAnswers[q.id]);
    return first < 0 ? 0 : first;
  });
  const [saving, setSaving] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [left, setLeft] = useState(secondsLeft);
  const submitted = useRef(false);

  const question = questions[index];
  const answered = questions.filter((q) => answers[q.id]).length;
  const unsaved = Object.values(failed).some(Boolean);

  const submit = useCallback(
    async (auto: boolean) => {
      if (submitted.current) return;
      submitted.current = true;
      setSubmitting(true);
      setError(null);
      const result = await submitAttempt(attemptId);
      if (result.ok) {
        router.refresh();
        return;
      }
      submitted.current = false;
      setSubmitting(false);
      setError(auto ? `หมดเวลาแล้ว แต่ส่งคำตอบไม่สำเร็จ: ${result.error} กรุณากด ส่งคำตอบ อีกครั้ง` : result.error);
    },
    [attemptId, router],
  );

  // นาฬิกานับถอยหลัง (เวลาจริงอยู่ที่เซิร์ฟเวอร์ ตัวเลขนี้ใช้แสดงผลและส่งให้อัตโนมัติเมื่อหมดเวลา)
  useEffect(() => {
    if (secondsLeft === null) return;
    const deadline = Date.now() + secondsLeft * 1000;
    const timer = setInterval(() => {
      const remain = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(remain);
      if (remain === 0) {
        clearInterval(timer);
        void submit(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft, submit]);

  const choose = async (questionId: string, choice: ChoiceKey) => {
    if (submitting) return;
    setAnswers((a) => ({ ...a, [questionId]: choice }));
    setSaving((count) => count + 1);
    const result = await saveAnswer(attemptId, questionId, choice);
    setSaving((count) => count - 1);
    setFailed((f) => ({ ...f, [questionId]: !result.ok }));
    setError(result.ok ? null : `บันทึกคำตอบข้อนี้ไม่สำเร็จ: ${result.error}`);
  };

  const confirmSubmit = () => {
    const missing = questions.length - answered;
    const message =
      missing > 0
        ? `ยังไม่ได้ตอบ ${missing} ข้อ ต้องการส่งคำตอบเลยหรือไม่ (ส่งแล้วแก้ไขไม่ได้)`
        : "ส่งคำตอบใช่หรือไม่ (ส่งแล้วแก้ไขไม่ได้)";
    if (window.confirm(message)) void submit(false);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="quiz-runner">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-2">
        <p className="font-semibold" data-testid="quiz-progress">
          ข้อ {(index + 1).toLocaleString("th-TH")} จาก {questions.length.toLocaleString("th-TH")} · ตอบแล้ว{" "}
          {answered.toLocaleString("th-TH")} ข้อ
        </p>
        <p className="flex items-center gap-3">
          <span role="status" className="text-sm text-muted-foreground" data-testid="save-status">
            {saving > 0 ? "กำลังบันทึก..." : unsaved ? "มีคำตอบที่ยังบันทึกไม่สำเร็จ" : answered > 0 ? "บันทึกคำตอบแล้ว" : ""}
          </span>
          {left !== null ? (
            <span
              data-testid="quiz-timer"
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 font-bold tabular-nums",
                left <= 300 ? "border-destructive text-destructive" : "border-input",
              )}
            >
              <Clock aria-hidden className="size-4" />
              <span className="sr-only">เวลาที่เหลือ</span>
              {clockText(left)}
            </span>
          ) : null}
        </p>
      </div>

      <ErrorText>{error}</ErrorText>

      <fieldset className="rounded-xl border bg-card p-4 sm:p-6" disabled={submitting}>
        <legend className="sr-only">ข้อ {index + 1}</legend>
        <p className="text-xl font-semibold whitespace-pre-line" data-testid="question-text">
          {(index + 1).toLocaleString("th-TH")}. {question.text}
        </p>
        <div className="mt-4 flex flex-col gap-3" role="radiogroup" aria-label={`ตัวเลือกของข้อ ${index + 1}`}>
          {CHOICE_KEYS.map((key) => {
            const selected = answers[question.id] === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                data-choice={key}
                onClick={() => choose(question.id, key)}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-lg transition-colors",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:border-primary",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full border-2 font-bold",
                    selected ? "border-primary-foreground" : "border-input",
                  )}
                >
                  {CHOICE_LABEL[key]}
                </span>
                <span className="min-w-0 flex-1">{question.choices[key]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" className="min-h-12 text-lg" disabled={index === 0 || submitting} onClick={() => setIndex(index - 1)}>
          ← ข้อก่อนหน้า
        </Button>
        {index < questions.length - 1 ? (
          <Button type="button" className="min-h-12 text-lg" disabled={submitting} onClick={() => setIndex(index + 1)}>
            ข้อถัดไป →
          </Button>
        ) : (
          <Button type="button" className="min-h-12 text-lg" disabled={submitting || saving > 0} onClick={confirmSubmit}>
            {submitting ? "กำลังส่ง..." : "ส่งคำตอบ"}
          </Button>
        )}
      </div>

      <nav aria-label="ไปที่ข้อ" className="rounded-xl border bg-card p-4">
        <p className="mb-2 text-sm text-muted-foreground">กดเลขข้อเพื่อไปที่ข้อนั้น (สีเข้ม = ตอบแล้ว)</p>
        <ol className="grid grid-cols-5 gap-2 sm:grid-cols-10" data-testid="question-map">
          {questions.map((q, i) => (
            <li key={q.id}>
              <button
                type="button"
                aria-label={`ข้อ ${i + 1}${answers[q.id] ? " ตอบแล้ว" : " ยังไม่ได้ตอบ"}`}
                aria-current={i === index ? "true" : undefined}
                data-answered={answers[q.id] ? "1" : "0"}
                disabled={submitting}
                onClick={() => setIndex(i)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-center rounded-lg border-2 font-semibold",
                  answers[q.id] ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
                  i === index ? "ring-[3px] ring-ring" : "",
                  failed[q.id] ? "border-destructive" : "",
                )}
              >
                {(i + 1).toLocaleString("th-TH")}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {index < questions.length - 1 ? (
        <div>
          <Button type="button" variant="outline" className="min-h-12 w-full text-lg sm:w-auto" disabled={submitting || saving > 0} onClick={confirmSubmit}>
            {submitting ? "กำลังส่ง..." : "ส่งคำตอบ"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
