import type { Metadata } from "next";

import { requireMenu } from "@/lib/auth/guards";
import { buildVenueReport } from "@/lib/venues-server";

import { ReportPrintSheet } from "../../../../personnel/reports/print/print-sheet";
import { readVenueReportParams } from "../params";

export const metadata: Metadata = { title: "พิมพ์บัญชีสนามสอบ" };
export const dynamic = "force-dynamic";

export default async function VenueReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu("/app/places");
  const { year, type, unit } = await readVenueReportParams(await searchParams);
  if (!ctx.canViewVenues || !year) {
    return <p className="p-6 text-muted-foreground">ไม่มีรายงานให้พิมพ์ (ยังไม่มีสิทธิ์ดูทะเบียนสนามสอบ หรือยังไม่มีปีการศึกษา)</p>;
  }
  return <ReportPrintSheet report={await buildVenueReport(year, unit, type)} emptyText="ไม่มีสนามสอบที่เปิดอยู่ในเขตนี้" />;
}
