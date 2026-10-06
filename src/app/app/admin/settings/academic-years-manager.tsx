"use client";

import { useState, useTransition } from "react";

import { ErrorText, Field, FormMessages, InfoText, SubmitButton, useServerForm } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { thaiDate } from "@/lib/thai";
import { requestDeadlinePassed, type AcademicYear } from "@/lib/venues";

import { addAcademicYear, setCurrentAcademicYear, setRequestDeadline } from "./actions";

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
        แต่ละปีกำหนดวันปิดรับคำขอเปิด ปิด ย้ายสนามสอบได้
      </p>
      {flash ? <InfoText>{flash}</InfoText> : null}
      <ErrorText>{error}</ErrorText>
      {years.length === 0 ? (
        <p className="mt-3 text-muted-foreground">ยังไม่มีปีการศึกษา กรุณาเพิ่มปีแรกด้านล่าง</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {years.map((y) => (
            <li key={y.id} className="border-b py-2 last:border-b-0" data-testid="academic-year" data-year={y.year_be}>
              <div className="flex flex-wrap items-center justify-between gap-3">
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
              </div>
              <DeadlineForm year={y} />
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

/** วันปิดรับคำขอเปิด ปิด ย้ายสนามสอบของปีการศึกษาหนึ่ง (พ้นวันนี้แล้วยื่นคำขอของปีนั้นไม่ได้) */
function DeadlineForm({ year }: { year: AcademicYear }) {
  const [state, setState] = useState<{ error?: string; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const passed = requestDeadlinePassed(year);
  const send = (formData: FormData) =>
    startTransition(async () => {
      setState(await setRequestDeadline(null, formData));
    });
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-sm">
        วันปิดรับคำขอสนามสอบ:{" "}
        <span className={passed ? "font-semibold text-destructive" : "font-semibold"} data-testid="deadline-value">
          {year.request_deadline ? `${thaiDate(year.request_deadline)}${passed ? " (ปิดรับแล้ว)" : ""}` : "ไม่กำหนด"}
        </span>{" "}
        <span className="text-primary underline underline-offset-4">แก้ไข</span>
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(new FormData(e.currentTarget));
        }}
        className="mt-2 flex flex-col gap-3 rounded-lg border p-3"
        noValidate
      >
        <input type="hidden" name="year_id" value={year.id} />
        {/* ชื่อช่องต่างกันในแต่ละปี เพื่อไม่ให้รหัสของช่องซ้ำกันในหน้าเดียว */}
        <input type="hidden" name="field" value={`deadline_${year.year_be}`} />
        <ThaiDateInput
          key={year.request_deadline ?? "none"}
          label={`วันปิดรับคำขอของปีการศึกษา ${year.year_be}`}
          name={`deadline_${year.year_be}`}
          defaultValue={year.request_deadline}
          hint="วันสุดท้ายที่ยื่นคำขอเปิด ปิด ย้ายสนามสอบของปีนี้ได้"
        />
        <FormMessages state={state} />
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={pending} pendingText="กำลังบันทึก...">
            บันทึกวันปิดรับ
          </SubmitButton>
          {year.request_deadline ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const formData = new FormData();
                formData.set("year_id", year.id);
                formData.set("clear", "1");
                send(formData);
              }}
            >
              ไม่กำหนดวันปิดรับ
            </Button>
          ) : null}
        </div>
      </form>
    </details>
  );
}
