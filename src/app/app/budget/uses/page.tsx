import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { USE_STATUS_CLASS, USE_STATUS_LABEL, baht, sumMoney } from "@/lib/budget";
import { fetchUseRows } from "@/lib/budget-server";
import { thaiDate } from "@/lib/thai";

import { UnitFilter } from "../../personnel/unit-filter";
import { YearSelect } from "../plan/year-select";
import { budgetQuery, loadBudgetScope } from "../scope";

export const metadata: Metadata = { title: "คำขอใช้งบประมาณและเบิกจ่าย" };
export const dynamic = "force-dynamic";

/** คำขอใช้งบของหน่วยที่เลือก พร้อมยอดผูกพัน เบิกจ่าย และคงค้าง */
export default async function UsesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { years, year, units, unit, unitEditable } = await loadBudgetScope(await searchParams);
  const rows = year && unit ? await fetchUseRows(year.id, unit.id) : [];
  const q = budgetQuery(year, unit);
  const active = rows.filter((r) => r.status === "approved" || r.status === "closed");

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/budget" className="text-primary underline underline-offset-4">
          งบประมาณ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">คำขอใช้งบประมาณและเบิกจ่าย</h1>
      <p className="mt-1 text-muted-foreground">
        ยื่นขอใช้งบจากหมวดรายจ่ายที่หน่วยถืออยู่ ผ่านเครื่องอนุมัติกลาง อนุมัติแล้วระบบกันเงิน (ผูกพัน) ทันที แล้วบันทึกเบิกจ่ายได้หลายงวด
        ยอดที่ไม่ได้ใช้คืนเข้ารายการด้วยปุ่ม คืนเงินเหลือจ่าย
      </p>
      {!unit || !year ? (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-5">
          {years.length ? "บทบาทของท่านยังไม่มีสิทธิ์ดูงบประมาณของหน่วยใด" : "ยังไม่มีปีงบประมาณในระบบ"}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
            <YearSelect years={years} value={year.year_be} unitId={unit.id} />
            <UnitFilter units={units} value={unit.id} param="unit" allowClear={false} applyLabel="ดูคำขอของหน่วยนี้" />
          </div>
          <dl className="grid gap-3 sm:grid-cols-3" data-testid="use-totals">
            {[
              ["ผูกพันสุทธิ", sumMoney(active.map((r) => Number(r.committed) - Number(r.released)))],
              ["เบิกจ่ายแล้ว", sumMoney(active.map((r) => r.disbursed))],
              ["คงค้างเบิก", sumMoney(active.map((r) => r.outstanding))],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-card p-4">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{baht(value)}</dd>
              </div>
            ))}
          </dl>
          {unitEditable && year.status === "open" ? (
            <div>
              <Button asChild>
                <Link href={`/app/budget/uses/new?${q}`} prefetch={false}>
                  <FilePlus2 aria-hidden />
                  ขอใช้งบ
                </Link>
              </Button>
            </div>
          ) : null}
          {rows.length === 0 ? (
            <p className="rounded-xl border bg-card p-5 text-muted-foreground" data-testid="uses-empty">
              ยังไม่มีคำขอใช้งบของ {unit.name} ปี {year.year_be}
            </p>
          ) : (
            <div className="relative overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[900px] border-collapse text-left" data-testid="uses-table">
                <thead className="bg-secondary">
                  <tr>
                    <th scope="col" className="px-3 py-2">เลขที่</th>
                    <th scope="col" className="px-3 py-2">วันที่ยื่น</th>
                    <th scope="col" className="px-3 py-2">รายการ / วัตถุประสงค์</th>
                    <th scope="col" className="px-3 py-2 text-right">ขอใช้ (บาท)</th>
                    <th scope="col" className="px-3 py-2 text-right">เบิกจ่าย (บาท)</th>
                    <th scope="col" className="px-3 py-2 text-right">คงค้าง (บาท)</th>
                    <th scope="col" className="px-3 py-2">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} className="border-t align-top" data-testid="use-row">
                      <td className="px-3 py-2">
                        <Link href={`/app/budget/uses/${u.id}?${q}`} prefetch={false} className="text-primary underline underline-offset-4">
                          {u.request_no ?? "-"}
                        </Link>
                        <span className="block text-sm text-muted-foreground">{u.requester_name}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{thaiDate(u.created_at, "short")}</td>
                      <td className="px-3 py-2">
                        {u.item_path}
                        <span className="block text-sm text-muted-foreground">{u.purpose}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{baht(u.amount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{baht(u.disbursed)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{baht(u.outstanding)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded border px-2 py-0.5 text-sm whitespace-nowrap ${USE_STATUS_CLASS[u.status] ?? ""}`}>
                          {USE_STATUS_LABEL[u.status] ?? u.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
