"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { ErrorText, FormMessages, InfoText, SubmitButton, selectClass, useServerForm } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/errors";
import {
  EXAM_LEVEL_LABEL,
  EXAM_LEVELS,
  EXAM_TYPE_LABEL,
  EXAM_TYPES,
  ROUND_STATUS_CLASS,
  ROUND_STATUS_LABEL,
  examName,
  roundWindow,
  type ExamRound,
} from "@/lib/exam-forms";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";
import type { AcademicYear } from "@/lib/venues";

import { cancelExamRound, saveExamRound, setExamRoundStatus } from "./actions";

/** ฟอร์มสร้างรอบ หรือแก้ไขรอบ (?edit=) ปี ประเภท ชั้น แก้ได้เฉพาะรอบที่ยังเป็นร่าง */
export function RoundForm({ years, round }: { years: AcademicYear[]; round: ExamRound | null }) {
  const { state, onSubmit, pending } = useServerForm(saveExamRound);
  const locked = round !== null && round.status !== "draft";
  const currentYear = years.find((y) => y.is_current) ?? years[0];

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4 rounded-xl border bg-card p-5" data-testid="round-form">
      <h2 className="text-xl font-bold text-primary">
        {round ? `แก้ไขรอบ ${examName(round.exam_type, round.level)} ปีการศึกษา ${round.year_be}` : "สร้างรอบใหม่"}
      </h2>
      {round ? <input type="hidden" name="id" value={round.id} /> : null}
      {years.length === 0 ? (
        <p className="text-destructive">ยังไม่มีปีการศึกษาในระบบ ให้ผู้ดูแลระบบเพิ่มที่หน้า บทบาทและค่าตั้ง ก่อน</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="academic_year_id">ปีการศึกษา</Label>
          <select
            id="academic_year_id"
            name="academic_year_id"
            className={selectClass}
            defaultValue={round?.academic_year_id ?? currentYear?.id ?? ""}
            disabled={locked}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.year_be}
                {y.is_current ? " (ปีปัจจุบัน)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="exam_type">ประเภท</Label>
          <select id="exam_type" name="exam_type" className={selectClass} defaultValue={round?.exam_type ?? ""} disabled={locked}>
            {round ? null : <option value="">เลือกประเภท</option>}
            {EXAM_TYPES.map((t) => (
              <option key={t} value={t}>
                {EXAM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="level">ชั้น</Label>
          <select id="level" name="level" className={selectClass} defaultValue={round?.level ?? ""} disabled={locked}>
            {round ? null : <option value="">เลือกชั้น</option>}
            {EXAM_LEVELS.map((l) => (
              <option key={l} value={l}>
                {EXAM_LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {locked ? <p className="text-sm text-muted-foreground">รอบที่เคยเปิดรับสมัครแล้ว แก้ได้เฉพาะวันที่และหมายเหตุ</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <ThaiDateInput label="วันเปิดรับสมัคร" name="opens_on" defaultValue={round?.opens_on} required />
        <ThaiDateInput label="วันปิดรับสมัคร" name="closes_on" defaultValue={round?.closes_on} required />
        <ThaiDateInput label="วันสอบ (วันแรก)" name="exam_starts_on" defaultValue={round?.exam_starts_on} required />
        <ThaiDateInput
          label="วันสอบวันสุดท้าย"
          name="exam_ends_on"
          defaultValue={round?.exam_ends_on}
          hint="เว้นว่างถ้าสอบวันเดียว"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="note">หมายเหตุ</Label>
        <textarea
          id="note"
          name="note"
          maxLength={500}
          rows={2}
          defaultValue={round?.note ?? ""}
          className="rounded-md border border-input bg-background px-3 py-2"
        />
      </div>
      <FormMessages state={state} />
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={pending} disabled={years.length === 0}>
          {round ? "บันทึกการแก้ไข" : "สร้างรอบ"}
        </SubmitButton>
        {round ? (
          <Link href="/app/exams/rounds" className="inline-flex h-11 items-center px-3 text-primary underline underline-offset-4">
            ยกเลิกการแก้ไข
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function RoundList({
  rounds,
  formCodes,
  today,
}: {
  rounds: ExamRound[];
  formCodes: Record<string, string>;
  today: string;
}) {
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (question: string, fn: () => Promise<ActionResult>) => {
    if (!window.confirm(question)) return;
    startTransition(async () => {
      setError(null);
      setFlash(null);
      const result = await fn();
      if (result.ok) setFlash(result.message ?? null);
      else setError(result.error);
    });
  };

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold text-primary">รอบทั้งหมด</h2>
      {flash ? <InfoText>{flash}</InfoText> : null}
      <ErrorText>{error}</ErrorText>
      {rounds.length === 0 ? (
        <p className="mt-2 text-muted-foreground">ยังไม่มีรอบสมัครสอบ</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3" data-testid="round-list">
          {rounds.map((r) => {
            const name = `${examName(r.exam_type, r.level)} ปีการศึกษา ${r.year_be}`;
            const w = roundWindow(r, today);
            const code = formCodes[`${r.exam_type}:${r.level}`];
            return (
              <li
                key={r.id}
                className={cn("rounded-xl border bg-card p-4", !r.is_active && "opacity-60")}
                data-testid="round-row"
                data-name={name}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg font-semibold">
                    {name}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {code ? `แบบ ${code}` : "ยังไม่มีแบบ ศ. ที่ใช้งาน"}
                    </span>
                  </span>
                  <span className={cn("rounded-full px-3 py-0.5 text-sm font-semibold", ROUND_STATUS_CLASS[r.status])} data-testid="round-status">
                    {r.is_active ? ROUND_STATUS_LABEL[r.status] : "ยกเลิกแล้ว"}
                  </span>
                </div>
                <p className="mt-1">
                  รับสมัคร {thaiDate(r.opens_on, "short")} – {thaiDate(r.closes_on, "short")} · สอบ {thaiDate(r.exam_starts_on, "short")}
                  {r.exam_ends_on && r.exam_ends_on !== r.exam_starts_on ? ` – ${thaiDate(r.exam_ends_on, "short")}` : ""}
                </p>
                {r.is_active ? (
                  <p className={cn("text-sm", w.accepting ? "font-semibold text-green-800" : "text-muted-foreground")}>{w.text}</p>
                ) : null}
                {r.note ? <p className="text-sm text-muted-foreground">หมายเหตุ: {r.note}</p> : null}
                {r.is_active ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.status !== "open" ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(`เปิดรับสมัคร ${name} ใช่หรือไม่`, () => setExamRoundStatus(r.id, "open"))
                        }
                      >
                        {r.status === "draft" ? "เปิดรับสมัคร" : "เปิดรับสมัครอีกครั้ง"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(`ปิดรับสมัคร ${name} ใช่หรือไม่`, () => setExamRoundStatus(r.id, "closed"))}
                      >
                        ปิดรับสมัคร
                      </Button>
                    )}
                    <Link
                      href={`/app/exams/rounds?edit=${r.id}`}
                      className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-secondary"
                    >
                      แก้ไข
                    </Link>
                    {r.status === "draft" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(`ยกเลิกรอบ ${name} ใช่หรือไม่ (นำกลับมาไม่ได้)`, () => cancelExamRound(r.id))}
                      >
                        ยกเลิกรอบ
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
