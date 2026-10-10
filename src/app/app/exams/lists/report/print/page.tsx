import type { Metadata } from "next";

import { requireMenu } from "@/lib/auth/guards";
import { buildListReport } from "@/lib/exam-lists-server";

import { ReportPrintSheet } from "../../../../personnel/reports/print/print-sheet";
import { readListReportParams } from "../params";

export const metadata: Metadata = { title: "พิมพ์รายงานสรุปผู้สมัครสอบ" };
export const dynamic = "force-dynamic";

export default async function ListReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMenu("/app/exams");
  const { kind, year, unit } = await readListReportParams(await searchParams);
  if (!year || !unit) return <p className="p-6 text-muted-foreground">ยังไม่มีรอบสมัครสอบ</p>;
  return <ReportPrintSheet report={await buildListReport(kind, year, unit)} emptyText="ไม่มีข้อมูลในเขตนี้" />;
}
