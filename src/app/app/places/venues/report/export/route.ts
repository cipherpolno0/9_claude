import type { NextRequest } from "next/server";

import { requireMenu } from "@/lib/auth/guards";
import { xlsxResponse } from "@/lib/data-table";
import { buildVenueReport } from "@/lib/venues-server";

import { readVenueReportParams } from "../params";

/** ส่งออกบัญชีสนามสอบเป็น Excel (ข้อมูลชุดเดียวกับที่แสดงบนจอ จำกัดตามสิทธิ์ดูทะเบียนสนามสอบของผู้ใช้) */
export async function GET(request: NextRequest) {
  const ctx = await requireMenu("/app/places");
  if (!ctx.canViewVenues) return new Response("ท่านไม่มีสิทธิ์ดูทะเบียนสนามสอบ", { status: 403 });
  const { year, type, unit } = await readVenueReportParams(request.nextUrl.searchParams);
  if (!year) return new Response("ยังไม่มีปีการศึกษาในระบบ", { status: 404 });
  const report = await buildVenueReport(year, unit, type);
  return xlsxResponse(
    `${report.title}${unit ? ` ${unit.name}` : ""}.xlsx`,
    "บัญชีสนามสอบ",
    report.columns.map((c) => ({ header: c.header, width: c.width })),
    report.rows,
  );
}
