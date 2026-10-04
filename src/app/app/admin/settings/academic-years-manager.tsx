"use client";

import { useState, useTransition } from "react";

import { ErrorText, Field, FormMessages, InfoText, SubmitButton, useServerForm } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { thaiDate } from "@/lib/thai";
import type { AcademicYear } from "@/lib/venues";

import { addAcademicYear, setCurrentAcademicYear } from "./actions";

/** ปีการศึกษา: เพิ่มปีใหม่ และตั้งปีปัจจุบัน (มีปีปัจจุบันได้ปีเดียว) ใช้กับทะเบียนสนามสอบและระบบสอบ */
export function AcademicYearsManager({ years }: { years: AcademicYear[] }) {
  const { state, onSubmit, pending } = useServerForm(addAcademicYear);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const makeCurrent = (year: AcademicYear) => {
    if (!window.confirm(`ตั้งปีการศึกษา ${year.year_be} เป็นปีปัจจุบันใช่หรือไม่ (หน้าทะเบียนสนามสอบจะแสดงและเตือนตามปีนี้)`)) return;
    startTransition(async () => {
      setError(null);
      setFlash(null);
      const result = await setCurrentAcademicYear(year.id);
      if (result.ok) setFlash(result.message ?? null);
      else setError(result.error);
    });
  };

  return (
    <div className="mt-6 rounded-xl border bg-card p-5" data-testid="academic-years">
      <h2 className="text-xl font-bold text-primary">ปีการศึกษา</h2>
      <p className="text-muted-foreground">
        ปีปัจจุบันใช้เป็นค่าเริ่มต้นของทะเบียนสนามสอบ (ประธานสนามสอบ ผู้รับข้อสอบ) และการเตือนสนามที่ยังไม่มีรายชื่อ
      </p>
      {flash ? <InfoText>{flash}</InfoText> : null}
      <ErrorText>{error}</ErrorText>
      {years.length === 0 ? (
        <p className="mt-3 text-muted-foreground">ยังไม่มีปีการศึกษา กรุณาเพิ่มปีแรกด้านล่าง</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {years.map((y) => (
            <li key={y.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-2 last:border-b-0">
              <span>
                <span className="font-semibold">ปีการศึกษา {y.year_be}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {thaiDate(y.starts_on, "short")} – {thaiDate(y.ends_on, "short")}
                </span>
              </span>
              {y.is_current ? (
                <span className="rounded-full border border-green-300 bg-green-100 px-3 py-0.5 text-sm font-semibold text-green-900">
                  ปีปัจจุบัน
                </span>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => makeCurrent(y)}>
                  ตั้งเป็นปีปัจจุบัน
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4 border-t pt-4" noValidate>
        <p className="font-semibold">เพิ่มปีการศึกษา</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="ปีการศึกษา (พ.ศ.)" name="year_be" inputMode="numeric" required id="new-year-be" />
          <ThaiDateInput label="วันเริ่ม" name="starts_on" required />
          <ThaiDateInput label="วันสิ้นสุด" name="ends_on" required />
        </div>
        <FormMessages state={state} />
        <div>
          <SubmitButton pending={pending} pendingText="กำลังบันทึก...">
            เพิ่มปีการศึกษา
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
