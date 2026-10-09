import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";

import { requireMenu } from "@/lib/auth/guards";
import { workbookResponse } from "@/lib/excel";
import { fetchVenueTotals } from "@/lib/exam-batches-server";
import { examName } from "@/lib/exam-forms";
import { fetchExamRounds } from "@/lib/exam-forms-server";
import { pivotVenueTotals, stageLabel } from "@/lib/exam-totals";
import { thaiDateTime } from "@/lib/thai";

const text = (body: string, status: number) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** ส่งออกยอดผู้สมัครต่อสนามสอบของรอบ (?round=) เฉพาะส่วนกลางและผู้ดูแลระบบ */
export async function GET(request: NextRequest) {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds) return text("ท่านไม่มีสิทธิ์ส่งออกยอดผู้สมัคร", 403);
  const roundId = request.nextUrl.searchParams.get("round") ?? "";
  const round = (await fetchExamRounds()).find((r) => r.id === roundId);
  if (!round) return text("ไม่พบรอบสมัครสอบ", 404);
  const result = await fetchVenueTotals(round.id);
  if (!result.ok) return text(result.error, 403);
  const table = pivotVenueTotals(result.rows);
  const multi = table.stages.length > 1;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ยอดต่อสนามสอบ", { views: [{ state: "frozen", ySplit: 3 }] });
  const name = `${examName(round.exam_type, round.level)} ปีการศึกษา ${round.year_be}`;
  sheet.getCell("A1").value = `ยอดผู้สมัครต่อสนามสอบ ${name}`;
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = `นับจากบัญชีที่ส่งแล้ว รวมระหว่างรับรอง · ข้อมูล ณ ${thaiDateTime(new Date())}`;
  const header = [
    "รหัสสนามสอบ",
    "ชื่อสนามสอบ",
    "ภาค",
    "จังหวัด",
    ...table.stages.map(stageLabel),
    ...(multi ? ["รวม"] : []),
    "รับรองแล้ว",
    "จำนวนบัญชี",
    "บัญชีรอรับรอง",
  ];
  const head = sheet.getRow(3);
  head.values = header;
  head.font = { bold: true };
  for (const r of table.rows) {
    sheet.addRow([
      r.venue_code,
      r.venue_name,
      r.region_name,
      r.province_name,
      ...r.byStage,
      ...(multi ? [r.total] : []),
      r.certified,
      r.accounts,
      r.pendingAccounts,
    ]);
  }
  const foot = sheet.addRow([
    "รวมทั้งหมด",
    "",
    "",
    "",
    ...table.totals.byStage,
    ...(multi ? [table.totals.total] : []),
    table.totals.certified,
    table.totals.accounts,
    "",
  ]);
  foot.font = { bold: true };
  sheet.columns.forEach((c, i) => (c.width = i === 1 ? 36 : i < 4 ? 16 : 12));
  sheet.getColumn(1).numFmt = "@";

  return workbookResponse(workbook, `ยอดผู้สมัครต่อสนามสอบ-${examName(round.exam_type, round.level)}-${round.year_be}.xlsx`);
}
