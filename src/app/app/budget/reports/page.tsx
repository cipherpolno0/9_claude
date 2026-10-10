import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BUDGET_REPORT_KINDS, BUDGET_REPORT_LABEL } from "@/lib/budget";
import { buildBudgetReport } from "@/lib/budget-reports";
import { cn } from "@/lib/utils";

import { UnitFilter } from "../../personnel/unit-filter";
import { ReportView } from "../../personnel/reports/report-view";
import { YearSelect } from "../plan/year-select";
import { readBudgetReportParams } from "./params";

export const metadata: Metadata = { title: "รายงานงบประมาณ" };
export const dynamic = "force-dynamic";

/** รายงานงบประมาณ 5 แบบ (บนจอ หน้าพิมพ์ Excel ใช้ข้อมูลชุดเดียวกัน) */
export default async function BudgetReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await readBudgetReportParams(await searchParams);
  const { years, year, units, unit, kind, sub, query } = p;
  const report =
    year && unit ? await buildBudgetReport(kind, { year, unit, sub }, (id) => `/app/budget/reports?${query({}, id)}`) : null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/budget" className="text-primary underline underline-offset-4">
          งบประมาณ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">รายงานงบประมาณ</h1>
      {!unit || !year ? (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-5">
          {years.length ? "บทบาทของท่านยังไม่มีสิทธิ์ดูงบประมาณของหน่วยใด" : "ยังไม่มีปีงบประมาณในระบบ"}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
            <YearSelect years={years} value={year.year_be} unitId={unit.id} />
            <UnitFilter units={units} value={unit.id} param="unit" allowClear={false} applyLabel="ดูรายงานของหน่วยนี้" />
          </div>
          <nav aria-label="ชนิดรายงาน" className="flex flex-wrap gap-2" data-testid="report-kinds">
            {BUDGET_REPORT_KINDS.map((k) => (
              <Link
                key={k}
                href={`/app/budget/reports?${p.query({ kind: k })}`}
                prefetch={false}
                aria-current={k === kind ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1",
                  k === kind ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary",
                )}
              >
                {BUDGET_REPORT_LABEL[k]}
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            {kind !== "unit" ? (
              <div className="flex flex-wrap gap-2" data-testid="scope-toggle">
                <Link
                  href={`/app/budget/reports?${p.query({ sub: "" })}`}
                  prefetch={false}
                  aria-current={sub ? "true" : undefined}
                  className={cn("rounded-md border px-3 py-1", sub ? "border-primary font-semibold" : "bg-card")}
                >
                  รวมหน่วยใต้สังกัด
                </Link>
                <Link
                  href={`/app/budget/reports?${p.query({ sub: "0" })}`}
                  prefetch={false}
                  aria-current={!sub ? "true" : undefined}
                  className={cn("rounded-md border px-3 py-1", !sub ? "border-primary font-semibold" : "bg-card")}
                >
                  เฉพาะหน่วยนี้
                </Link>
              </div>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/app/budget/reports/print?${query()}`} prefetch={false} target="_blank">
                  <Printer aria-hidden />
                  พิมพ์
                </Link>
              </Button>
              <Button asChild variant="outline">
                <a href={`/app/budget/reports/export?${query()}`}>
                  <FileSpreadsheet aria-hidden />
                  ส่งออก Excel
                </a>
              </Button>
            </div>
          </div>
          {report ? <ReportView report={report} /> : null}
        </div>
      )}
    </section>
  );
}
