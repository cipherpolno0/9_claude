import type { Metadata } from "next";
import Link from "next/link";
import { Download, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { fetchAccessibleUnits } from "@/lib/org-units-server";
import { todayIso } from "@/lib/persons";
import { REPORT_DESCRIPTION, REPORT_KINDS, REPORT_LABEL, fiscalYearOf, fiscalYearRange } from "@/lib/reports";
import { buildReport, fetchStatusSummary } from "@/lib/reports-server";
import { cn } from "@/lib/utils";

import { UnitFilter } from "../unit-filter";
import { readReportParams, reportQuery } from "./params";
import { ReportView } from "./report-view";

export const metadata: Metadata = { title: "รายงานบุคลากร" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMenu("/app/personnel");
  const { kind, fiscalYear, roots, unit } = await readReportParams(await searchParams);
  const [units, report, summary] = await Promise.all([
    fetchAccessibleUnits(),
    unit ? buildReport(kind, unit, fiscalYear) : null,
    unit && kind === "status" ? fetchStatusSummary(unit.id) : [],
  ]);
  const years = [...new Set([fiscalYearOf(todayIso()), ...summary.map((r) => r.fiscal_year)])].sort((a, b) => b - a);
  const query = reportQuery(kind, unit?.id, fiscalYear);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/personnel" className="text-primary underline underline-offset-4">
          ← กลับไปทะเบียนบุคคล
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">รายงานบุคลากร</h1>
      <p className="mt-1 text-muted-foreground">เลือกรายงานและเขต แล้วส่งออกเป็น Excel หรือเปิดหน้าพิมพ์ได้</p>

      {roots.length === 0 || !unit ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground">
          บทบาทของท่านยังไม่มีสิทธิ์ดูทะเบียนบุคคล จึงไม่มีรายงานให้แสดง
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <nav aria-label="เลือกรายงาน" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="report-kinds">
            {REPORT_KINDS.map((k) => (
              <Link
                key={k}
                href={`/app/personnel/reports?${reportQuery(k, unit.id, null)}`}
                aria-current={k === kind ? "page" : undefined}
                className={cn(
                  "rounded-xl border p-3",
                  k === kind ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary",
                )}
              >
                <span className="block font-semibold">{REPORT_LABEL[k]}</span>
                <span className={cn("block text-sm", k === kind ? "text-primary-foreground/90" : "text-muted-foreground")}>
                  {REPORT_DESCRIPTION[k]}
                </span>
              </Link>
            ))}
          </nav>

          {roots.length > 1 ? (
            <nav aria-label="เลือกภาค" className="flex flex-wrap gap-2">
              {roots.map((r) => (
                <Link
                  key={r.id}
                  href={`/app/personnel/reports?${reportQuery(kind, r.id, fiscalYear)}`}
                  aria-current={unit.id === r.id ? "page" : undefined}
                  className={cn(
                    "rounded-md border px-3 py-2 font-medium",
                    unit.id === r.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                  )}
                >
                  {r.name}
                </Link>
              ))}
            </nav>
          ) : null}
          <UnitFilter
            units={units}
            value={unit.id}
            param="unit"
            currentName={unit.name}
            applyLabel="แสดงรายงานของเขตนี้"
            allowClear={false}
          />

          {kind === "status" ? (
            <nav aria-label="เลือกปีงบประมาณ" className="flex flex-wrap items-center gap-2" data-testid="report-years">
              <span className="font-semibold">ปีงบประมาณ:</span>
              {[null, ...years].map((y) => (
                <Link
                  key={y ?? "all"}
                  href={`/app/personnel/reports?${reportQuery(kind, unit.id, y)}`}
                  aria-current={fiscalYear === y ? "page" : undefined}
                  title={y ? fiscalYearRange(y) : undefined}
                  className={cn(
                    "rounded-md border px-3 py-1.5",
                    fiscalYear === y ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                  )}
                >
                  {y ?? "สรุปทุกปี"}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={`/app/personnel/reports/export?${query}`} download>
                <Download aria-hidden />
                ส่งออก Excel
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/app/personnel/reports/print?${query}`} target="_blank">
                <Printer aria-hidden />
                หน้าพิมพ์
              </Link>
            </Button>
          </div>

          {report ? <ReportView report={report} /> : null}
        </div>
      )}
    </section>
  );
}
