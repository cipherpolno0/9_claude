import type { Metadata } from "next";

import { buildDocsReport } from "@/lib/docs-reports";

import { ReportPrintSheet } from "../../../personnel/reports/print/print-sheet";
import { readDocsReportParams } from "../params";

export const metadata: Metadata = { title: "พิมพ์รายงานสารบรรณ" };
export const dynamic = "force-dynamic";

export default async function DocsReportPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, unit, kind, year, month, direction, fiscalYear } = await readDocsReportParams(await searchParams);
  if (!ctx.canViewDocs || !unit) return <p className="p-6 text-muted-foreground">ไม่มีรายงานให้พิมพ์ (ยังไม่มีสิทธิ์ดูสารบรรณ)</p>;
  const report = await buildDocsReport(kind, { unit, direction, year, month, fiscalYear });
  return <ReportPrintSheet report={report} orientation="landscape" emptyText="ไม่มีหนังสือในช่วงนี้" />;
}
