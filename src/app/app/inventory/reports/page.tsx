import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Printer } from "lucide-react";

import { selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { buildAssetReport } from "@/lib/asset-reports";
import { ASSET_REPORT_KINDS, ASSET_REPORT_LABEL } from "@/lib/assets";
import { cn } from "@/lib/utils";

import { UnitFilter } from "../../personnel/unit-filter";
import { ReportView } from "../../personnel/reports/report-view";
import { InventoryNav, NoAccess } from "../ui";
import { readAssetReportParams } from "./params";

export const metadata: Metadata = { title: "รายงานพัสดุ-ครุภัณฑ์" };
export const dynamic = "force-dynamic";

/** รายงาน 5 แบบ (บนจอ หน้าพิมพ์ Excel ใช้ข้อมูลชุดเดียวกัน) */
export default async function InventoryReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await readAssetReportParams(await searchParams);
  const { ctx, units, unit, sub, year, currentYear, kind, counts, countId, query } = p;
  const report = unit ? await buildAssetReport(kind, { unit, sub, year, countId }, (id) => `/app/inventory/reports?${query({}, id)}`) : null;
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
  const usesYear = kind === "depreciation" || kind === "issues" || kind === "compare";

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">รายงานพัสดุ-ครุภัณฑ์</h1>
      <InventoryNav current="/app/inventory/reports" />
      {!ctx.canViewInventory || !unit ? (
        <NoAccess />
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <nav aria-label="ชนิดรายงาน" className="flex flex-wrap gap-2" data-testid="report-kinds">
            {ASSET_REPORT_KINDS.map((k) => (
              <Link
                key={k}
                href={`/app/inventory/reports?${p.query({ kind: k, count: "" })}`}
                prefetch={false}
                aria-current={k === kind ? "page" : undefined}
                className={cn("rounded-full border px-3 py-1", k === kind ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}
              >
                {ASSET_REPORT_LABEL[k]}
              </Link>
            ))}
          </nav>
          <UnitFilter units={units} value={unit.id} param="unit" allowClear={false} applyLabel="ดูรายงานของหน่วยนี้" />
          <form method="get" action="/app/inventory/reports" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="unit" value={unit.id} />
            {usesYear ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="rp-year" className="text-sm text-muted-foreground">
                  ปีงบประมาณ
                </label>
                <select id="rp-year" name="year" defaultValue={year} className={selectClass}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {kind === "count" ? (
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
                <label htmlFor="rp-count" className="text-sm text-muted-foreground">
                  รอบตรวจนับ
                </label>
                <select id="rp-count" name="count" defaultValue={countId ?? ""} className={selectClass}>
                  {counts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} · {c.unit_name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {kind !== "compare" && kind !== "count" ? (
              <label className="flex h-11 items-center gap-2">
                <input type="checkbox" name="sub" value="0" defaultChecked={!sub} className="size-5" />
                เฉพาะหน่วยนี้ (ไม่รวมใต้สังกัด)
              </label>
            ) : null}
            <Button type="submit" variant="outline">
              แสดง
            </Button>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/app/inventory/reports/print?${query()}`} prefetch={false} target="_blank">
                  <Printer aria-hidden />
                  พิมพ์
                </Link>
              </Button>
              <Button asChild variant="outline">
                <a href={`/app/inventory/reports/export?${query()}`}>
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
