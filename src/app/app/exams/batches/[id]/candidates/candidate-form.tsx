"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ErrorText } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import type { CandidateError, EditMode } from "@/lib/exam-batches";
import type { FormColumn } from "@/lib/exam-forms";
import { cn } from "@/lib/utils";

import { saveCandidate } from "../../actions";

const inputClass = "h-11 w-full rounded-md border border-input bg-background px-3";

/** ฟอร์มแก้ไขรายคน / เพิ่มทีละคน สร้างช่องตามคอลัมน์ของแบบ ศ. */
export function CandidateForm({
  batchId,
  candidateId,
  columns,
  initial,
  maskedNid,
  titles,
  mode,
  strict,
}: {
  batchId: string;
  candidateId: string | null;
  columns: FormColumn[];
  initial: Record<string, string>;
  maskedNid: string | null;
  titles: string[];
  mode: Exclude<EditMode, null>;
  strict: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<CandidateError[]>([]);
  const [pending, startTransition] = useTransition();
  const fieldErrors = (key: string) => errors.filter((e) => e.field === key);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      setErrors([]);
      const result = await saveCandidate(batchId, candidateId, formData);
      if (!result.ok) {
        setError(result.error);
        setErrors(result.errors ?? []);
        window.scrollTo({ top: 0 });
        return;
      }
      router.push(`/app/exams/batches/${batchId}?saved=${encodeURIComponent(result.message)}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-5" noValidate>
      {error ? (
        <div className="flex flex-col gap-2">
          <ErrorText>{error}</ErrorText>
          {errors.length ? (
            <ul className="list-disc pl-6 text-destructive" data-testid="form-errors">
              {errors.map((e, i) => (
                <li key={i}>
                  <strong>{e.label}</strong>: {e.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {strict ? (
        <p className="rounded-lg border bg-secondary px-4 py-3">
          บัญชีนี้ยืนยันรายชื่อแล้ว ข้อมูลต้องผ่านการตรวจทุกข้อจึงบันทึกได้ และนับเป็นผู้สมัครทันที (ออกรหัสผู้สมัครให้ถ้ายังไม่มี)
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {columns.map((col) => {
          const id = `f_${col.key}`;
          const errs = fieldErrors(col.key);
          const required = col.required || col.type === "id";
          const errorText = errs.length ? (
            <p className="text-sm font-medium text-destructive" id={`${id}-error`}>
              {errs.map((e) => e.message).join(" · ")}
            </p>
          ) : null;
          if (col.type === "date") {
            return (
              <div key={col.key} className={cn(errs.length && "rounded-md border border-destructive p-2")}>
                <ThaiDateInput label={col.label} name={id} defaultValue={initial[col.key] ?? null} required={col.required} hint={col.help} />
                {errorText}
              </div>
            );
          }
          const label = (
            <label htmlFor={id} className="font-medium">
              {col.label}
              {required && !(col.key === "national_id" && candidateId) && col.key !== "seq" ? (
                <span className="text-destructive"> *</span>
              ) : null}
            </label>
          );
          const hint =
            col.key === "national_id" && candidateId
              ? `เว้นว่าง = ใช้เลขเดิม${maskedNid ? ` (${maskedNid})` : " (ไม่มีเลข)"}`
              : col.key === "seq" && !candidateId
                ? "เว้นว่าง = ต่อจากเลขที่มากที่สุดในบัญชี"
                : col.help;
          const common = {
            id,
            name: id,
            "aria-invalid": errs.length ? true : undefined,
            "aria-describedby": errs.length ? `${id}-error` : undefined,
            className: cn(inputClass, errs.length && "border-destructive"),
          };
          return (
            <div key={col.key} className="flex flex-col gap-1">
              {label}
              {col.type === "list" ? (
                <select {...common} defaultValue={initial[col.key] ?? ""}>
                  <option value="">- เลือก -</option>
                  {(col.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : col.type === "title" ? (
                <>
                  <input {...common} list={`${id}-list`} defaultValue={initial[col.key] ?? ""} maxLength={200} />
                  <datalist id={`${id}-list`}>
                    {titles.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </>
              ) : (
                <input
                  {...common}
                  defaultValue={col.key === "national_id" ? "" : (initial[col.key] ?? "")}
                  inputMode={col.type === "number" || col.type === "year" || col.type === "id" ? "numeric" : undefined}
                  maxLength={col.type === "id" ? 25 : 200}
                  autoComplete="off"
                />
              )}
              {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
              {errorText}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="reason" className="font-medium">
          เหตุผลของการแก้ไข{mode === "override" ? <span className="text-destructive"> * (ส่วนกลางแก้แทน ต้องระบุ)</span> : " (ไม่บังคับ)"}
        </label>
        <textarea id="reason" name="reason" rows={2} maxLength={500} className="w-full rounded-md border border-input bg-background p-2" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "กำลังบันทึก..." : candidateId ? "บันทึกการแก้ไข" : "เพิ่มรายชื่อ"}
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href={`/app/exams/batches/${batchId}`}>ยกเลิก</Link>
        </Button>
      </div>
    </form>
  );
}
