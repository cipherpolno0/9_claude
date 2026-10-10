import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { examName } from "@/lib/exam-forms";
import { fetchPassHistory } from "@/lib/exam-results-server";
import { thaiDate } from "@/lib/thai";

import { confirmHistoryImport, previewHistoryImport } from "../actions";
import { ResultsImportButton } from "../import-button";
import { HistoryActiveButton } from "./history-row-actions";

export const metadata: Metadata = { title: "ผลสอบได้ย้อนหลัง" };
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("th-TH");
const inputClass = "h-11 rounded-md border border-input bg-background px-3 text-base";

/** ผลสอบได้ย้อนหลัง (ก่อนมีระบบ) ใช้เป็นหลักฐานคุณสมบัติชั้นโท เอก (ส่วนกลาง) */
export default async function PassHistoryPage({ searchParams }: { searchParams: Promise<{ q?: string; inactive?: string; page?: string }> }) {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds) redirect("/app/exams/results/lists");
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const active = sp.inactive !== "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await fetchPassHistory(q, active, (page - 1) * 200);
  const total = rows[0]?.total ?? 0;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams/results" className="text-primary underline underline-offset-4">
          ผลสอบ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ผลสอบได้ย้อนหลัง</h1>
      <p className="mt-1 text-muted-foreground">
        รายชื่อผู้สอบได้ของปีที่ยังไม่มีในระบบ ใช้เป็นหลักฐานคุณสมบัติเมื่อสมัครชั้นโทและเอก (ระบบตรวจทุกแถวที่สมัครชั้นโท เอก
        ว่ามีผลสอบได้ชั้นก่อนหน้า) จับคู่บุคคลด้วยเลขประจำตัว หรือ ชื่อ นามสกุล และวันเกิด
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline">
          <a href="/app/exams/results/history/template" download>
            <Download aria-hidden />
            ดาวน์โหลดแม่แบบ
          </a>
        </Button>
        <ResultsImportButton
          label="นำเข้าจาก Excel"
          title="นำเข้าผลสอบได้ย้อนหลัง"
          columns={["เลขประจำตัว", "ชื่อ", "ประเภท", "ชั้น", "ปี"]}
          itemUnit="รายการ"
          preview={previewHistoryImport}
          confirm={confirmHistoryImport}
        />
      </div>

      <form className="mt-6 flex flex-wrap items-end gap-2" action="/app/exams/results/history">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">ค้นชื่อ เลขที่ ปกศ. หรือสำนัก</span>
          <input name="q" defaultValue={q} maxLength={100} className={inputClass} />
        </label>
        <label className="flex items-center gap-2 pb-3">
          <input type="checkbox" name="inactive" value="1" defaultChecked={!active} className="size-5" />
          ดูรายการที่ปิดใช้งาน
        </label>
        <Button type="submit" variant="outline">
          ค้นหา
        </Button>
      </form>
      <p className="mt-2 text-sm text-muted-foreground" data-testid="history-total">
        {n(total)} รายการ
      </p>
      <div className="mt-2 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[52rem] border-collapse text-left text-sm" data-testid="history-rows">
          <thead className="bg-secondary">
            <tr>
              <th scope="col" className="px-3 py-2">ชื่อ</th>
              <th scope="col" className="px-3 py-2">เลขประจำตัว</th>
              <th scope="col" className="px-3 py-2">วันเกิด</th>
              <th scope="col" className="px-3 py-2">สอบได้</th>
              <th scope="col" className="px-3 py-2">เลขที่ ปกศ.</th>
              <th scope="col" className="px-3 py-2">สำนักเรียน</th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">จัดการ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  ยังไม่มีรายการ
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t" data-testid="history-row">
                  <td className="px-3 py-2">{[r.title, r.first_name, r.monastic_name, r.last_name].filter(Boolean).join(" ")}</td>
                  <td className="px-3 py-2">{r.national_id_last4 ? `*********${r.national_id_last4}` : "-"}</td>
                  <td className="px-3 py-2">{r.birth_date ? thaiDate(r.birth_date, "short") : "-"}</td>
                  <td className="px-3 py-2">
                    {examName(r.exam_type, r.level)} {r.year_be}
                  </td>
                  <td className="px-3 py-2">{r.certificate_no || "-"}</td>
                  <td className="px-3 py-2">{r.place_name || "-"}</td>
                  <td className="px-3 py-2">
                    <HistoryActiveButton id={r.id} active={r.is_active} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {total > 200 ? (
        <nav aria-label="หน้า" className="mt-3 flex gap-2">
          {page > 1 ? (
            <Link href={`/app/exams/results/history?${new URLSearchParams({ q, ...(active ? {} : { inactive: "1" }), page: String(page - 1) })}`} className="rounded-md border bg-card px-4 py-2">
              ก่อนหน้า
            </Link>
          ) : null}
          {page * 200 < total ? (
            <Link href={`/app/exams/results/history?${new URLSearchParams({ q, ...(active ? {} : { inactive: "1" }), page: String(page + 1) })}`} className="rounded-md border bg-card px-4 py-2">
              ถัดไป
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
