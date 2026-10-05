"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/errors";
import type { QuestionStatus } from "@/lib/quiz";

import { setQuestionActive, setQuestionStatus } from "../../actions";

/** ปุ่มเผยแพร่ / ถอนกลับเป็นร่าง และปิด / เปิดใช้งานข้อสอบ */
export function QuestionActions({ questionId, status, isActive }: { questionId: string; status: QuestionStatus; isActive: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const next = await action();
      setResult(next);
      if (next.ok) router.refresh();
    });

  return (
    <>
      {isActive ? (
        status === "draft" ? (
          <Button type="button" onClick={() => run(() => setQuestionStatus(questionId, "published"))} disabled={pending}>
            เผยแพร่
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => run(() => setQuestionStatus(questionId, "draft"))} disabled={pending}>
            ถอนกลับเป็นร่าง
          </Button>
        )
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (
            isActive &&
            !window.confirm("ปิดใช้งานข้อสอบข้อนี้ใช่หรือไม่ (ข้อมูลไม่ถูกลบ ผู้เรียนจะไม่เห็นข้อนี้ และเปิดใช้งานใหม่ได้)")
          ) {
            return;
          }
          run(() => setQuestionActive(questionId, !isActive));
        }}
      >
        {isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
      </Button>
      {result ? (
        <div className="basis-full">{result.ok ? <InfoText>{result.message}</InfoText> : <ErrorText>{result.error}</ErrorText>}</div>
      ) : null}
    </>
  );
}
