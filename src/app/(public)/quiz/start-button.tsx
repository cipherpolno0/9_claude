"use client";

import { ErrorText, SubmitButton, useServerForm } from "@/components/form";
import type { AttemptKind } from "@/lib/quiz";

import { startQuiz } from "./actions";

/** ปุ่มเริ่มหรือทำแบบทดสอบต่อ (ปุ่มใหญ่ กดง่ายบนมือถือ) */
export function StartQuizButton({
  kind,
  unitId,
  courseId,
  restart = false,
  variant = "default",
  confirmText,
  children,
}: {
  kind: AttemptKind;
  unitId?: string;
  courseId?: string;
  restart?: boolean;
  variant?: "default" | "outline";
  /** ถ้ามี จะถามยืนยันก่อนเริ่ม */
  confirmText?: string;
  children: React.ReactNode;
}) {
  const { state, onSubmit, pending } = useServerForm(startQuiz);
  return (
    <form
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="unit_id" value={unitId ?? ""} />
      <input type="hidden" name="course_id" value={courseId ?? ""} />
      <input type="hidden" name="restart" value={restart ? "1" : ""} />
      <SubmitButton pending={pending} pendingText="กำลังเตรียมข้อสอบ..." variant={variant} className="min-h-12 w-full px-6 text-lg sm:w-auto">
        {children}
      </SubmitButton>
      <ErrorText>{state?.error}</ErrorText>
    </form>
  );
}
