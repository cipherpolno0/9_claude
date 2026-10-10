import ExcelJS from "exceljs";

import { buildBudgetReport } from "@/lib/budget-reports";
import { workbookResponse } from "@/lib/excel";

import { readBudgetReportParams } from "../params";

/** ส่งออกรายงานงบประมาณเป็น Excel (จำนวนเงินเป็นตัวเลข รูปแบบ #,##0.00) */
export async function GET(request: Request) {
  const search = Object.fromEntries(new URL(request.url).searchParams);
  const { year, unit, kind, sub } = await readBudgetReportParams(search);
  if (!year || !unit) {
    return new Response("ท่านไม่มีสิทธิ์ดูงบประมาณของหน่วยนี้", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const report = await buildBudgetReport(kind, { year, unit, sub }, () => "");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(report.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "), { views: [{ state: "frozen", ySplit: 4 }] });
  sheet.getCell("A1").value = report.title;
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = report.subtitle;
  if (report.note) sheet.getCell("A3").value = report.note;
  sheet.getRow(4).values = report.columns.map((c) => c.header);
  sheet.getRow(4).font = { bold: true };
  sheet.columns = report.columns.map((c) => ({ width: c.width ?? 18 }));
  for (const r of report.rows) sheet.addRow(r);
  if (report.footer && report.rows.length) sheet.addRow(report.footer).font = { bold: true };
  report.columns.forEach((c, i) => {
    if (c.format === "money") sheet.getColumn(i + 1).numFmt = "#,##0.00";
    if (c.format === "percent") sheet.getColumn(i + 1).numFmt = '0.00"%"';
  });
  return workbookResponse(workbook, `${report.title}-${year.year_be}-${unit.code || "หน่วย"}.xlsx`);
}
