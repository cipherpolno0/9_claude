import type { NextRequest } from "next/server";

import { requireMenu } from "@/lib/auth/guards";
import { xlsxResponse } from "@/lib/data-table";
import { buildListReport } from "@/lib/exam-lists-server";

import { readListReportParams } from "../params";

/** ส่งออกรายงานสรุปผู้สมัครสอบเป็น Excel (ข้อมูลชุดเดียวกับบนจอ จำกัดตามสิทธิ์เห็นบัญชีของผู้ใช้) */
export async function GET(request: NextRequest) {
  await requireMenu("/app/exams");
  const { kind, year, unit } = await readListReportParams(request.nextUrl.searchParams);
  if (!year || !unit) return new Response("ยังไม่มีรอบสมัครสอบ", { status: 404 });
  const report = await buildListReport(kind, year, unit);
  return xlsxResponse(
    `${report.title} ${unit.name}.xlsx`,
    kind === "counts" ? "จำนวนผู้สมัคร" : "สมัครซ้ำข้ามสำนัก",
    report.columns.map((c) => ({ header: c.header.replace(/:\s*$/, ""), width: c.width })),
    report.footer ? [...report.rows, report.footer] : report.rows,
  );
}
