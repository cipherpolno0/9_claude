"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Search } from "lucide-react";

import { ErrorText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BATCH_STATUS_CLASS, BATCH_STATUS_LABEL } from "@/lib/exam-batches";
import { examName } from "@/lib/exam-forms";
import { groupPeople, type PersonGroup, type PersonRow } from "@/lib/exam-lists";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { searchPersonAction } from "./actions";

const personName = (r: PersonRow) => [r.title, r.first_name, r.monastic_name, r.last_name].filter((s) => s?.trim()).join(" ");

function PersonCard({ group }: { group: PersonGroup }) {
  const head = group.rows[0];
  const years = new Set(group.rows.map((r) => r.year_be)).size;
  return (
    <li className="rounded-xl border bg-card p-4" data-testid="person-card">
      <p className="text-lg font-bold">{personName(head)}</p>
      <p className="text-sm text-muted-foreground">
        {head.national_id_last4 ? `เลขประจำตัว *********${head.national_id_last4}` : "ไม่มีเลขประจำตัว"}
        {head.birth_date ? ` · เกิด ${thaiDate(head.birth_date)}` : ""} · สมัคร {group.rows.length} ครั้ง ใน {years} ปี
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-left text-sm" data-testid="person-history">
          <thead className="bg-secondary">
            <tr>
              <th scope="col" className="px-3 py-2">ปี</th>
              <th scope="col" className="px-3 py-2">ชั้นที่สมัคร</th>
              <th scope="col" className="px-3 py-2">สำนัก/สถานศึกษา</th>
              <th scope="col" className="px-3 py-2">สนามสอบ</th>
              <th scope="col" className="px-3 py-2">รหัสผู้สมัคร</th>
              <th scope="col" className="px-3 py-2">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((r) => (
              <tr key={r.candidate_id} className="border-t align-top" data-testid="person-row" data-year={r.year_be}>
                <td className="px-3 py-2 font-semibold">{r.year_be}</td>
                <td className="px-3 py-2">
                  {r.form_code} {examName(r.exam_type, r.level)}
                  {r.stage ? ` · ${r.stage}` : ""}
                </td>
                <td className="px-3 py-2">
                  {r.place_name}
                  <span className="block text-muted-foreground">{r.unit_name}</span>
                </td>
                <td className="px-3 py-2">
                  {r.venue_code} {r.venue_name}
                </td>
                <td className="px-3 py-2">{r.candidate_code ?? "-"}</td>
                <td className="px-3 py-2">
                  {r.cand_status === "withdrawn" ? (
                    <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium">ถอนแล้ว</span>
                  ) : (
                    <span className={cn("rounded-full px-2.5 py-0.5 font-medium", BATCH_STATUS_CLASS[r.batch_status])}>
                      {BATCH_STATUS_LABEL[r.batch_status]}
                    </span>
                  )}
                  {r.request_no ? <span className="block text-muted-foreground">เลขที่รับ {r.request_no}</span> : null}
                  {r.cand_status === "withdrawn" && r.withdraw_reason ? (
                    <span className="block text-muted-foreground">เหตุผล: {r.withdraw_reason}</span>
                  ) : null}
                  <Link href={`/app/exams/batches/${r.batch_id}`} prefetch={false} className="block text-primary underline underline-offset-4">
                    เปิดบัญชี
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </li>
  );
}

/** ตรวจสอบรายบุคคล: ค้นแล้วแสดงทุกการสมัครของบุคคลที่พบ (ปีล่าสุดก่อน) */
export function PersonSearch() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<PersonGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await searchPersonAction(query);
      if (r.ok) {
        setError(null);
        setResult(groupPeople(r.rows));
      } else {
        setResult(null);
        setError(r.error);
      }
    });
  };

  return (
    <div className="mt-6 flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end" data-testid="person-form">
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="person-q">ชื่อ ฉายา นามสกุล หรือเลขประจำตัว</Label>
          <Input
            id="person-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={120}
            autoComplete="off"
            placeholder="เช่น สมชาย ใจดี หรือ เลข 13 หลัก"
          />
        </div>
        <Button type="submit" disabled={pending}>
          <Search aria-hidden />
          {pending ? "กำลังค้น..." : "ค้นหา"}
        </Button>
      </form>
      <ErrorText>{error}</ErrorText>
      {result === null ? null : result.length === 0 ? (
        <p className="rounded-xl border bg-card p-5 text-muted-foreground" data-testid="person-none">
          ไม่พบผู้สมัครตามคำค้นในเขตที่ท่านมีสิทธิ์เห็น
        </p>
      ) : (
        <>
          <p data-testid="person-total">พบ {result.length.toLocaleString("th-TH")} คน</p>
          <ul className="flex flex-col gap-3">
            {result.map((g) => (
              <PersonCard key={g.ref} group={g} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
