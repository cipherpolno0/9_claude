"use client";

import { useState, useTransition } from "react";
import { Search } from "lucide-react";

import { ErrorText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { examName } from "@/lib/exam-forms";
import { PUBLIC_CHECK_LIMIT, checkPublicQuery, type PublicCheckRow } from "@/lib/exam-lists";

import { checkRegistration } from "./actions";

const fullName = (r: PublicCheckRow) => [r.title, r.first_name, r.monastic_name, r.last_name].filter((s) => s?.trim()).join(" ");

/** ฟอร์มตรวจรายชื่อผู้ขอเข้าสอบ: กรอกอย่างน้อย 2 ช่อง ชื่อต้องตรงทั้งคำ แสดงไม่เกิน 20 รายการ */
export function CheckForm() {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [year, setYear] = useState("");
  const [rows, setRows] = useState<PublicCheckRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = checkPublicQuery({ first, last, year });
    if (!q.ok) {
      setError(q.error);
      return;
    }
    startTransition(async () => {
      const r = await checkRegistration({ first, last, year });
      if (r.ok) {
        setError(null);
        setRows(r.rows);
        setTotal(r.total);
      } else {
        setError(r.error);
        if (!r.limited) setRows(null);
      }
    });
  };

  return (
    <div className="mt-6 flex flex-col gap-4">
      <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-end" data-testid="check-form" noValidate>
        <div className="flex flex-col gap-1">
          <Label htmlFor="check-first">ชื่อ</Label>
          <Input id="check-first" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={100} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="check-last">นามสกุล หรือฉายา</Label>
          <Input id="check-last" value={last} onChange={(e) => setLast(e.target.value)} maxLength={100} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="check-year">ปี พ.ศ. ที่สอบ</Label>
          <Input id="check-year" value={year} onChange={(e) => setYear(e.target.value)} maxLength={4} inputMode="numeric" placeholder="เช่น 2569" autoComplete="off" />
        </div>
        <Button type="submit" disabled={pending}>
          <Search aria-hidden />
          {pending ? "กำลังค้น..." : "ตรวจรายชื่อ"}
        </Button>
        <p className="text-sm text-muted-foreground sm:col-span-4">
          กรอกอย่างน้อย 2 ช่อง ชื่อและนามสกุลต้องสะกดตรงทั้งคำ (ไม่ค้นบางส่วน) ไม่ต้องใส่คำนำหน้า
        </p>
      </form>
      <ErrorText>{error}</ErrorText>
      {rows === null ? null : rows.length === 0 ? (
        <p className="rounded-xl border bg-card p-5 text-muted-foreground" data-testid="check-none">
          ไม่พบรายชื่อ ตรวจการสะกดชื่อและนามสกุล หรือสอบถามสำนักเรียนที่ส่งรายชื่อ (รายชื่อขึ้นเมื่อสำนักส่งบัญชีแล้วเท่านั้น)
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p data-testid="check-total">
            พบ {total.toLocaleString("th-TH")} รายการ
            {total > rows.length ? ` แสดง ${PUBLIC_CHECK_LIMIT} รายการแรก กรุณาระบุให้ละเอียดขึ้น` : ""}
          </p>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[40rem] border-collapse text-left" data-testid="check-table">
              <thead className="bg-secondary text-sm">
                <tr>
                  <th scope="col" className="px-3 py-2">ชื่อ</th>
                  <th scope="col" className="px-3 py-2">ชั้นที่สมัคร</th>
                  <th scope="col" className="px-3 py-2">สำนัก/สถานศึกษา</th>
                  <th scope="col" className="px-3 py-2">สนามสอบ</th>
                  <th scope="col" className="px-3 py-2">ปี</th>
                  <th scope="col" className="px-3 py-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t align-top" data-testid="check-row">
                    <td className="px-3 py-2 font-medium">{fullName(r)}</td>
                    <td className="px-3 py-2">
                      {examName(r.exam_type, r.level)}
                      {r.stage ? ` (${r.stage})` : ""}
                    </td>
                    <td className="px-3 py-2">{r.place_name}</td>
                    <td className="px-3 py-2">{r.venue_name}</td>
                    <td className="px-3 py-2">{r.year_be}</td>
                    <td className="px-3 py-2">{r.certified ? "รับรองแล้ว" : "อยู่ระหว่างรับรอง"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
