"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RESULT_LABEL, RESULTS, SUBJECTS, type ResultCode, type Scores } from "@/lib/exam-results";

import { saveResult } from "../../../actions";

/** บันทึกหรือแก้ผลสอบรายคน (ส่วนกลาง) รอบที่ประกาศแล้วต้องระบุเหตุผล */
export function ResultForm({
  candidateId,
  backHref,
  published,
  initial,
}: {
  candidateId: string;
  backHref: string;
  published: boolean;
  initial: { result: ResultCode | null; scores: Scores | null; certificate_no: string; note: string };
}) {
  const router = useRouter();
  const [result, setResult] = useState<string>(initial.result ?? "");
  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries(SUBJECTS.map((s) => [s.key, initial.scores?.[s.key] != null ? String(initial.scores[s.key]) : ""])),
  );
  const [cert, setCert] = useState(initial.certificate_no);
  const [note, setNote] = useState(initial.note);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="result-form"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await saveResult(candidateId, { result, scores, certificate_no: cert, note, reason });
          if (r.ok) {
            setError(null);
            setFlash(r.message ?? null);
            router.push(`${backHref}?saved=${encodeURIComponent(r.message ?? "บันทึกแล้ว")}`);
          } else setError(r.error);
        });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">ผลสอบ</legend>
        <div className="flex flex-wrap gap-4">
          {RESULTS.map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input type="radio" name="result" value={r} checked={result === r} onChange={() => setResult(r)} className="size-5" />
              {RESULT_LABEL[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-4">
        {SUBJECTS.map((s) => (
          <div key={s.key} className="flex flex-col gap-1">
            <Label htmlFor={`score-${s.key}`}>คะแนน{s.label} (ถ้ามี)</Label>
            <Input
              id={`score-${s.key}`}
              inputMode="decimal"
              value={scores[s.key]}
              disabled={result === "absent"}
              onChange={(e) => setScores({ ...scores, [s.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="certificate_no">เลขที่ ปกศ. (เฉพาะผู้สอบได้)</Label>
          <Input id="certificate_no" value={cert} maxLength={40} disabled={result !== "passed"} onChange={(e) => setCert(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="note">หมายเหตุ</Label>
          <Input id="note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="reason">
          เหตุผลการแก้ไข{published ? <span className="text-destructive"> * (รอบนี้ประกาศผลแล้ว)</span> : " (ไม่บังคับ ก่อนประกาศผล)"}
        </Label>
        <textarea
          id="reason"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2"
        />
      </div>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || !result}>
          {pending ? "กำลังบันทึก..." : "บันทึกผลสอบ"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={pending}>
          กลับ
        </Button>
      </div>
    </form>
  );
}
