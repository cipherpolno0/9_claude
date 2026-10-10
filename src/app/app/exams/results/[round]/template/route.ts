import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";

import { requireMenu } from "@/lib/auth/guards";
import { workbookResponse } from "@/lib/excel";
import { examName } from "@/lib/exam-forms";
import { RESULT_IMPORT_HEADERS, RESULT_LABEL, SUBJECTS, type ResultRow } from "@/lib/exam-results";
import { fetchResultRounds, fetchResultRows, isUuid } from "@/lib/exam-results-server";

const text = (body: string, status: number) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** แม่แบบนำเข้าผลสอบของรอบ (?venue= เฉพาะสนามสอบ) เติมรหัสผู้สมัคร ชื่อ สำนัก สนาม และผลเดิม (ถ้ามี) */
export async function GET(request: NextRequest, { params }: { params: Promise<{ round: string }> }) {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds) return text("ดาวน์โหลดได้เฉพาะเจ้าหน้าที่ส่วนกลางและผู้ดูแลระบบ", 403);
  const { round: roundId } = await params;
  const round = isUuid(roundId) ? (await fetchResultRounds()).find((r) => r.id === roundId) : null;
  if (!round) return text("ไม่พบรอบสมัครสอบ", 404);
  const venue = request.nextUrl.searchParams.get("venue");
  const venueId = isUuid(venue) ? venue : null;

  const rows: ResultRow[] = [];
  for (let offset = 0; offset < 200000; offset += 10000) {
    const part = await fetchResultRows(round.id, { venue: venueId, limit: 10000, offset });
    rows.push(...part);
    if (part.length < 10000) break;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ผลสอบ", { views: [{ state: "frozen", ySplit: 1 }] });
  const head = sheet.getRow(1);
  head.values = [...RESULT_IMPORT_HEADERS];
  head.font = { bold: true };
  sheet.columns = [18, 34, 30, 30, 12, ...SUBJECTS.map(() => 11), 18, 24].map((width) => ({ width }));
  for (const r of rows) {
    sheet.addRow([
      r.candidate_code,
      [r.title, r.first_name, r.monastic_name, r.last_name].filter(Boolean).join(" ") + (r.stage ? ` (${r.stage})` : ""),
      r.place_name,
      `${r.venue_code} ${r.venue_name}`,
      r.result ? RESULT_LABEL[r.result] : "",
      ...SUBJECTS.map((s) => r.scores?.[s.key] ?? null),
      r.certificate_no ?? "",
      r.note ?? "",
    ]);
  }
  const last = Math.max(2, rows.length + 1);
  for (let i = 2; i <= last; i++) {
    sheet.getCell(`E${i}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"สอบได้,สอบตก,ขาดสอบ"'],
      showErrorMessage: true,
      errorTitle: "ผลสอบ",
      error: "เลือก สอบได้ สอบตก หรือ ขาดสอบ",
    };
  }
  const name = `แม่แบบผลสอบ-${examName(round.exam_type, round.level)}-${round.year_be}${venueId && rows[0] ? `-${rows[0].venue_code}` : ""}.xlsx`;
  return workbookResponse(workbook, name);
}
