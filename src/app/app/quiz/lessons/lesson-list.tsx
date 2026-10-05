"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { ErrorText, FormMessages, SubmitButton, useServerForm } from "@/components/form";
import { QuestionStatusBadge } from "@/components/question-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/errors";
import type { QuestionStatus } from "@/lib/quiz";

import { createLesson, moveLesson, setLessonActive } from "../actions";

type Item = { id: string; title: string; status: QuestionStatus; is_active: boolean; blockCount: number; questionCount: number };

const n = (value: number) => value.toLocaleString("th-TH");

/** รายการบทเรียนของหน่วย: เลื่อนลำดับ เปิดแก้ไข เปิดใช้งานใหม่ และฟอร์มเพิ่มบทเรียน */
export function LessonList({ unitId, lessons, hasMcq }: { unitId: string; lessons: Item[]; hasMcq: boolean }) {
  const router = useRouter();
  const { state, onSubmit, pending: creating } = useServerForm(createLesson);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = lessons.filter((l) => l.is_active);
  const inactive = lessons.filter((l) => !l.is_active);

  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await action();
      setError(result.ok ? null : result.error);
      if (result.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border bg-card p-5" data-testid="lessons-active">
        <h2 className="text-xl font-bold text-primary">บทเรียนของหน่วยนี้ ({n(active.length)} หัวข้อ)</h2>
        <p className="text-muted-foreground">
          ลำดับในรายการนี้คือลำดับปกติที่ผู้เรียนเห็น{hasMcq ? " (หัวข้อที่ผู้เรียนตอบผิดในแบบทดสอบก่อนเรียนจะถูกยกขึ้นบนสุดให้อัตโนมัติ)" : ""}
        </p>
        <ErrorText>{error}</ErrorText>
        {active.length === 0 ? <p className="mt-3 text-muted-foreground">ยังไม่มีบทเรียน เพิ่มหัวข้อแรกได้ที่ช่องด้านล่าง</p> : null}
        <ol className="mt-3 flex flex-col gap-2">
          {active.map((l, i) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3" data-lesson={l.title}>
              <span className="w-8 shrink-0 text-center font-bold text-muted-foreground">{n(i + 1)}</span>
              <div className="min-w-0 flex-1">
                <p>
                  <Link href={`/app/quiz/lessons/${l.id}`} className="font-semibold text-primary underline underline-offset-4">
                    {l.title}
                  </Link>{" "}
                  <QuestionStatusBadge status={l.status} />
                </p>
                <p className="text-sm text-muted-foreground">
                  เนื้อหา {n(l.blockCount)} ชิ้น{hasMcq ? ` · ข้อสอบที่ผูกกับหัวข้อนี้ ${n(l.questionCount)} ข้อ` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`เลื่อน ${l.title} ขึ้น`}
                disabled={pending || i === 0}
                onClick={() => run(() => moveLesson(l.id, "up"))}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`เลื่อน ${l.title} ลง`}
                disabled={pending || i === active.length - 1}
                onClick={() => run(() => moveLesson(l.id, "down"))}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button asChild variant="outline">
                <Link href={`/app/quiz/lessons/${l.id}`}>แก้ไข</Link>
              </Button>
            </li>
          ))}
        </ol>

        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 border-t pt-4" noValidate>
          <input type="hidden" name="unit_id" value={unitId} />
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Label htmlFor="new-lesson-title">เพิ่มบทเรียน: หัวข้อ</Label>
              <Input id="new-lesson-title" name="title" placeholder="หัวข้อบทเรียน" />
            </div>
            <SubmitButton pending={creating} pendingText="กำลังเพิ่ม...">
              เพิ่มบทเรียน
            </SubmitButton>
          </div>
          <FormMessages state={state} />
        </form>
      </div>

      {inactive.length > 0 ? (
        <div className="rounded-xl border bg-card p-5" data-testid="lessons-inactive">
          <h2 className="text-xl font-bold text-primary">บทเรียนที่ปิดใช้งาน ({n(inactive.length)} หัวข้อ)</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {inactive.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-muted-foreground">
                <span className="min-w-0 flex-1">{l.title}</span>
                <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => setLessonActive(l.id, true))}>
                  เปิดใช้งาน
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
