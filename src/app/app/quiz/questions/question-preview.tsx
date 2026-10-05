"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CHOICE_KEYS, CHOICE_LABEL, type ChoiceKey } from "@/lib/quiz";
import { cn } from "@/lib/utils";

/**
 * ตัวอย่างข้อสอบตามที่ผู้เรียนจะเห็น: เลือกคำตอบแล้วกด ตรวจคำตอบ จึงเห็นข้อถูกและคำอธิบายเฉลย
 * ใช้ทั้งในฟอร์ม (ดูตัวอย่างขณะกรอก) และหน้ารายละเอียดข้อสอบ (ดูก่อนเผยแพร่)
 */
export function QuestionPreview({
  question,
  choices,
  correct,
  explanation,
}: {
  question: string;
  choices: Record<ChoiceKey, string>;
  correct: ChoiceKey | "";
  explanation: string;
}) {
  const [picked, setPicked] = useState<ChoiceKey | "">("");
  const [checked, setChecked] = useState(false);

  return (
    <div className="rounded-xl border-2 border-dashed border-input bg-secondary p-5" data-testid="question-preview">
      <p className="text-sm font-semibold text-muted-foreground">ตัวอย่างตามที่ผู้เรียนจะเห็น</p>
      <p className="mt-2 text-lg font-semibold whitespace-pre-line">{question || "(ยังไม่ได้กรอกโจทย์)"}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {CHOICE_KEYS.map((key) => {
          const isCorrect = checked && key === correct;
          const isWrong = checked && key === picked && key !== correct;
          return (
            <li key={key}>
              <label
                data-choice={key}
                data-result={isCorrect ? "correct" : isWrong ? "wrong" : undefined}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2",
                  isCorrect ? "border-green-600 bg-green-50" : isWrong ? "border-destructive bg-destructive/5" : "",
                )}
              >
                <input
                  type="radio"
                  name="preview-choice"
                  className="size-5 accent-[var(--primary)]"
                  checked={picked === key}
                  onChange={() => {
                    setPicked(key);
                    setChecked(false);
                  }}
                />
                <span>
                  <span className="font-semibold">{CHOICE_LABEL[key]}.</span> {choices[key] || "(ยังไม่ได้กรอก)"}
                  {isCorrect ? <span className="ml-2 font-semibold text-green-800">ข้อถูก</span> : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => setChecked(true)} disabled={!picked || !correct}>
          ตรวจคำตอบ
        </Button>
        {checked ? (
          <p role="status" className={cn("font-semibold", picked === correct ? "text-green-800" : "text-destructive")}>
            {picked === correct ? "ตอบถูก" : `ตอบผิด ข้อถูกคือ ${correct ? CHOICE_LABEL[correct] : "-"}`}
          </p>
        ) : null}
      </div>
      {checked ? (
        <div className="mt-3 rounded-lg border bg-card p-3" data-testid="preview-explanation">
          <p className="font-semibold">คำอธิบายเฉลย</p>
          <p className="whitespace-pre-line">{explanation || "(ไม่มีคำอธิบายเฉลย)"}</p>
        </div>
      ) : null}
    </div>
  );
}
