import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TRANSFER_STATUS_CLASS, TRANSFER_STATUS_LABEL, baht } from "@/lib/budget";
import { fetchTransferRows } from "@/lib/budget-server";
import { thaiDate } from "@/lib/thai";

import { UnitFilter } from "../../personnel/unit-filter";
import { YearSelect } from "../plan/year-select";
import { budgetQuery, loadBudgetScope } from "../scope";

export const metadata: Metadata = { title: "คำขอโอนเปลี่ยนแปลงงบประมาณ" };
export const dynamic = "force-dynamic";

/** คำขอโอนเปลี่ยนแปลงระหว่างรายการของหน่วยเจ้าของงบที่เลือก */
export default async function TransfersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { years, year, units, unit, unitEditable } = await loadBudgetScope(await searchParams);
  const rows = year && unit ? await fetchTransferRows(year.id, unit.id) : [];
  const q = budgetQuery(year, unit);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/budget" className="text-primary underline underline-offset-4">
          งบประมาณ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">คำขอโอนเปลี่ยนแปลงงบประมาณ</h1>
      <p className="mt-1 text-muted-foreground">
        โอนวงเงินระหว่างหมวดรายจ่ายของหน่วยเจ้าของงบเดียวกันในปีเดียวกัน ผ่านเครื่องอนุมัติกลาง เจ้าคณะหรือรองเจ้าคณะของหน่วยนั้นพิจารณา
        (งบของส่วนกลาง เจ้าหน้าที่ส่วนกลางพิจารณา) อนุมัติแล้วระบบย้ายวงเงินและบันทึกประวัติให้
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
          {unitEditable && year.status === "open" ? (
            <div>
              <Button asChild>
                <Link href={`/app/budget/transfers/new?${q}`} prefetch={false}>
                  <ArrowLeftRight aria-hidden />
                  ยื่นคำขอโอน
                </Link>
              </Button>
            </div>
          ) : null}
          {rows.length === 0 ? (
            <p className="rounded-xl border bg-card p-5 text-muted-foreground" data-testid="transfers-empty">
              ยังไม่มีคำขอโอนของ {unit.name} ปี {year.year_be}
            </p>
          ) : (
            <div className="relative overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[760px] border-collapse text-left" data-testid="transfers-table">
                <thead className="bg-secondary">
                  <tr>
                    <th scope="col" className="px-3 py-2">เลขที่</th>
                    <th scope="col" className="px-3 py-2">วันที่ยื่น</th>
                    <th scope="col" className="px-3 py-2">จาก</th>
                    <th scope="col" className="px-3 py-2">ไปยัง</th>
                    <th scope="col" className="px-3 py-2 text-right">จำนวนเงิน (บาท)</th>
                    <th scope="col" className="px-3 py-2">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-t align-top" data-testid="transfer-row">
                      <td className="px-3 py-2">
                        <Link href={`/app/budget/transfers/${t.id}?${q}`} prefetch={false} className="text-primary underline underline-offset-4">
                          {t.request_no ?? "-"}
                        </Link>
                        <span className="block text-sm text-muted-foreground">{t.requester_name}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{thaiDate(t.created_at, "short")}</td>
                      <td className="px-3 py-2">{t.from_path}</td>
                      <td className="px-3 py-2">{t.to_path}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{baht(t.amount)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded border px-2 py-0.5 text-sm ${TRANSFER_STATUS_CLASS[t.status] ?? ""}`}>
                          {TRANSFER_STATUS_LABEL[t.status] ?? t.status}
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
