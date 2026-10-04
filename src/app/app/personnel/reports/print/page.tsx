import type { Metadata } from "next";

import { requireMenu } from "@/lib/auth/guards";
import { buildReport } from "@/lib/reports-server";

import { readReportParams } from "../params";
import { ReportPrintSheet } from "./print-sheet";

export const metadata: Metadata = { title: "พิมพ์รายงานบุคลากร" };
export const dynamic = "force-dynamic";

export default async function ReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMenu("/app/personnel");
  const { kind, fiscalYear, unit } = await readReportParams(await searchParams);
  if (!unit) {
    return <p className="p-6 text-muted-foreground">บทบาทของท่านยังไม่มีสิทธิ์ดูทะเบียนบุคคล จึงไม่มีรายงานให้พิมพ์</p>;
  }
  return <ReportPrintSheet report={await buildReport(kind, unit, fiscalYear)} />;
}
