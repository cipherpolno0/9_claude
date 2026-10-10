import type { Metadata } from "next";

import { buildBudgetReport } from "@/lib/budget-reports";

import { ReportPrintSheet } from "../../../personnel/reports/print/print-sheet";
import { readBudgetReportParams } from "../params";

export const metadata: Metadata = { title: "พิมพ์รายงานงบประมาณ" };
export const dynamic = "force-dynamic";

export default async function BudgetReportPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { year, unit, kind, sub } = await readBudgetReportParams(await searchParams);
  if (!year || !unit) return <p className="p-6 text-muted-foreground">ไม่มีรายงานให้พิมพ์ (ยังไม่มีสิทธิ์ดูงบประมาณ หรือยังไม่มีปีงบประมาณ)</p>;
  const report = await buildBudgetReport(kind, { year, unit, sub }, () => "");
  return <ReportPrintSheet report={report} orientation="landscape" emptyText="ไม่มีข้อมูลงบประมาณในขอบเขตนี้" />;
}
