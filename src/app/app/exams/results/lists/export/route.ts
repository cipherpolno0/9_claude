import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";

import { requireMenu } from "@/lib/auth/guards";
import { workbookResponse } from "@/lib/excel";
import { examName } from "@/lib/exam-forms";
import { certSort, passSections } from "@/lib/exam-results";
import { fetchPassList, fetchResultForms } from "@/lib/exam-results-server";

import { passColumns, summaryLine } from "../pass-list";
import { readPassListParams } from "../params";

/** ส่งออกบัญชีผู้สอบได้เป็น Excel: หนึ่งบัญชีต่อสำนัก (หรือสนามสอบ) เรียงต่อกันในแผ่นงานเดียว อายุ พรรษาเป็นตัวเลขจริง (ใช้ภายใน) */
export async function GET(request: NextRequest) {
  const ctx = await requireMenu("/app/exams");
  const p = await readPassListParams(request.nextUrl.searchParams, ctx.canManageExamRounds);
  if (!p.round || (!p.place && !p.venue)) {
    return new Response("กรุณาเลือกรอบ และสนามสอบหรือสำนัก", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const round = p.round;
  const [rows, forms] = await Promise.all([fetchPassList(round.id, p.unit, p.place, p.venue), fetchResultForms()]);
  const form = forms.find((f) => f.exam_type === round.exam_type);
  const sections = passSections(rows, round.exam_type, round.level, p.by);
  const cols = passColumns(round.exam_type);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`ผู้สอบได้ ${form?.code ?? ""}`.trim());
  sheet.columns = cols.map((c) => ({ width: c === "เลขที่" ? 18 : c === "อายุ" || c === "พรรษา" ? 8 : 22 }));
  if (round.result_status !== "published") sheet.addRow(["ร่าง ยังไม่ประกาศผล"]).font = { bold: true, color: { argb: "FFC00000" } };
  for (const s of sections) {
    sheet.addRow([`${s.title} ในสนามหลวง พ.ศ. ${round.year_be}`]).font = { bold: true, size: 13 };
    sheet.addRow([s.heading]).font = { bold: true };
    sheet.addRow([summaryLine(round.exam_type, s.summary)]);
    const head = sheet.addRow(cols);
    head.font = { bold: true };
    for (const r of s.rows.filter((x) => x.result === "passed").sort(certSort)) {
      const name = [r.title, r.first_name].filter(Boolean).join("");
      sheet.addRow(
        round.exam_type === "nak_tham"
          ? [r.certificate_no ?? "", name, r.monastic_name, r.last_name, r.age, r.phansa, r.vals.temple_name ?? "", r.vals.temple_district ?? "", r.note ?? ""]
          : [r.certificate_no ?? "", name, r.last_name, r.age, r.vals.org_name ?? "", r.vals.temple_name ?? "", r.note ?? ""],
      );
    }
    sheet.addRow([]);
  }
  if (sections.length === 0) sheet.addRow(["ไม่มีรายชื่อ"]);
  return workbookResponse(workbook, `บัญชีผู้สอบได้-${form?.code ?? ""}-${examName(round.exam_type, round.level)}-${round.year_be}.xlsx`);
}
