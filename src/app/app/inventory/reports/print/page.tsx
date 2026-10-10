import type { Metadata } from "next";

import { buildAssetReport } from "@/lib/asset-reports";

import { ReportPrintSheet } from "../../../personnel/reports/print/print-sheet";
import { readAssetReportParams } from "../params";

export const metadata: Metadata = { title: "พิมพ์รายงานพัสดุ-ครุภัณฑ์" };
export const dynamic = "force-dynamic";

export default async function InventoryReportPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { unit, sub, year, kind, countId } = await readAssetReportParams(await searchParams);
  if (!unit) return <p className="p-6 text-muted-foreground">ไม่มีรายงานให้พิมพ์ (ยังไม่มีสิทธิ์ดูพัสดุ)</p>;
  const report = await buildAssetReport(kind, { unit, sub, year, countId }, () => "");
  return <ReportPrintSheet report={report} orientation="landscape" emptyText="ไม่มีข้อมูลในขอบเขตนี้" />;
}
