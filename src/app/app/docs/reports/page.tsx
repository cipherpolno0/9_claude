import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Printer } from "lucide-react";

import { selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { DOC_REPORT_KINDS, DOC_REPORT_LABEL, THAI_MONTHS } from "@/lib/docs";
import { buildDocsReport } from "@/lib/docs-reports";
import { fetchDocsCounts } from "@/lib/docs-server";
import { cn } from "@/lib/utils";

import { ReportView } from "../../personnel/reports/report-view";
import { DocsNav, DocsNoAccess } from "../ui";
import { readDocsReportParams } from "./params";

export const metadata: Metadata = { title: "รายงานสารบรรณ" };
export const dynamic = "force-dynamic";

/** รายงานสารบรรณ 3 แบบ (บนจอ หน้าพิมพ์ Excel ใช้ข้อมูลชุดเดียวกัน) */
export default async function DocsReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await readDocsReportParams(await searchParams);
  const { ctx, units, unit, kind, year, month, direction, fiscalYear, currentFy, thisYear, query } = p;
  const [counts, report] = await Promise.all([
    fetchDocsCounts(),
    ctx.canViewDocs && unit ? buildDocsReport(kind, { unit, direction, year, month, fiscalYear }) : Promise.resolve(null),
  ]);
  const years = Array.from({ length: 10 }, (_, i) => thisYear - i);
  const fys = Array.from({ length: 10 }, (_, i) => currentFy - i);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">รายงานสารบรรณ</h1>
      <DocsNav current="reports" counts={counts} showRegister={ctx.canViewDocs} />
      {!ctx.canViewDocs || !unit ? (
        <DocsNoAccess isAdmin={ctx.isAdmin} />
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <nav aria-label="ชนิดรายงาน" className="flex flex-wrap gap-2" data-testid="report-kinds">
            {DOC_REPORT_KINDS.map((k) => (
              <Link
                key={k}
                href={`/app/docs/reports?${query({ kind: k })}`}
                prefetch={false}
                aria-current={k === kind ? "page" : undefined}
                className={cn("rounded-full border px-3 py-1", k === kind ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}
              >
                {DOC_REPORT_LABEL[k]}
              </Link>
            ))}
          </nav>
          <form method="get" action="/app/docs/reports" className="flex flex-wrap items-end gap-2" data-testid="report-form">
            <input type="hidden" name="kind" value={kind} />
            {kind !== "duration" && units.length > 1 ? (
              <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                หน่วย
                <select name="unit" defaultValue={unit.id} className={selectClass}>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="unit" value={unit.id} />
            )}
            {kind === "register" ? (
              <>
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  ทะเบียน
                  <select name="dir" defaultValue={direction} className={selectClass}>
                    <option value="receive">หนังสือรับ</option>
                    <option value="send">หนังสือส่ง</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  เดือน
                  <select name="month" defaultValue={month} className={selectClass}>
                    {THAI_MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  ปี พ.ศ.
                  <select name="year" defaultValue={year} className={selectClass}>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {kind === "duration" ? (
              <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                ปีงบประมาณ
                <select name="fy" defaultValue={fiscalYear} className={selectClass}>
                  {fys.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Button type="submit" variant="outline">
              แสดง
            </Button>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/app/docs/reports/print?${query()}`} prefetch={false} target="_blank">
                  <Printer aria-hidden />
                  พิมพ์
                </Link>
              </Button>
              <Button asChild variant="outline">
                <a href={`/app/docs/reports/export?${query()}`}>
                  <FileSpreadsheet aria-hidden />
                  ส่งออก Excel
                </a>
              </Button>
            </div>
          </form>
          {report ? <ReportView report={report} /> : null}
        </div>
      )}
    </section>
  );
}
