import type { NextRequest } from "next/server";

import { requireMenu } from "@/lib/auth/guards";
import { xlsxResponse } from "@/lib/data-table";
import { buildReport } from "@/lib/reports-server";

import { readReportParams } from "../params";

/** ส่งออกรายงานบุคลากรเป็น Excel (ข้อมูลชุดเดียวกับที่แสดงบนจอ จำกัดตามสิทธิ์ดูของผู้ใช้) */
export async function GET(request: NextRequest) {
  await requireMenu("/app/personnel");
  const { kind, fiscalYear, unit } = await readReportParams(request.nextUrl.searchParams);
  if (!unit) return new Response("ท่านไม่มีสิทธิ์ดูทะเบียนบุคคล", { status: 403 });
  const report = await buildReport(kind, unit, fiscalYear);
  const rows = report.footer && report.rows.length > 0 ? [...report.rows, report.footer] : report.rows;
  return xlsxResponse(
    `${report.title} ${unit.name}.xlsx`,
    report.title.slice(0, 31),
    report.columns.map((c) => ({ header: c.header, width: c.width })),
    rows,
  );
}
