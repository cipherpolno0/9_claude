import ExcelJS from "exceljs";

import { buildDocsReport } from "@/lib/docs-reports";
import { workbookResponse } from "@/lib/excel";

import { readDocsReportParams } from "../params";

export const dynamic = "force-dynamic";

/** ส่งออกรายงานสารบรรณเป็น Excel (หนังสือลับที่มองไม่เห็นส่งออกเพียงเลขและวันที่) */
export async function GET(request: Request) {
  const search = Object.fromEntries(new URL(request.url).searchParams);
  const { ctx, unit, kind, year, month, direction, fiscalYear } = await readDocsReportParams(search);
  if (!ctx.canViewDocs || !unit) {
    return new Response("ท่านไม่มีสิทธิ์ดูสารบรรณ", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const report = await buildDocsReport(kind, { unit, direction, year, month, fiscalYear });
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
  return workbookResponse(workbook, `${report.title}.xlsx`);
}
