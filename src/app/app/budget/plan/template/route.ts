import ExcelJS from "exceljs";

import { PLAN_IMPORT_HEADERS } from "@/lib/budget";
import { fetchBudgetOptions } from "@/lib/budget-server";
import { workbookResponse } from "@/lib/excel";

import { loadBudgetScope } from "../../scope";

const text = (msg: string, status: number) =>
  new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** แม่แบบนำเข้าแผนงบประมาณ: หัวคอลัมน์แถวแรก รายการหมวดรายจ่ายและแหล่งเงินจากค่าตั้งปัจจุบัน */
export async function GET(request: Request) {
  const search = Object.fromEntries(new URL(request.url).searchParams);
  const { year, unit, unitEditable } = await loadBudgetScope(search);
  if (!year || !unit || !unitEditable) return text("ท่านไม่มีสิทธิ์แก้ไขงบประมาณของหน่วยนี้", 403);
  const { sources, categories } = await fetchBudgetOptions();
  const activeCats = categories.filter((c) => c.is_active).map((c) => c.name);
  const activeSources = sources.filter((s) => s.is_active).map((s) => s.name);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("แผนงบประมาณ", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.getRow(1).values = [...PLAN_IMPORT_HEADERS];
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [36, 40, 18, 18, 22, 30].map((width) => ({ width }));

  // รายการให้เลือก อยู่ในแผ่นงานซ่อน (ไม่ติดเพดานความยาวสูตรของ Excel)
  const lists = workbook.addWorksheet("รายการ", { state: "hidden" });
  activeCats.forEach((name, i) => (lists.getCell(i + 1, 1).value = name));
  activeSources.forEach((name, i) => (lists.getCell(i + 1, 2).value = name));
  for (let r = 2; r <= 1001; r++) {
    if (activeCats.length) {
      sheet.getCell(`C${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'รายการ'!$A$1:$A$${activeCats.length}`],
        showErrorMessage: true,
        errorTitle: "หมวดรายจ่าย",
        error: "เลือกจากรายการเท่านั้น",
      };
    }
    if (activeSources.length) {
      sheet.getCell(`E${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'รายการ'!$B$1:$B$${activeSources.length}`],
        showErrorMessage: true,
        errorTitle: "แหล่งเงิน",
        error: "เลือกจากรายการเท่านั้น",
      };
    }
    sheet.getCell(`D${r}`).numFmt = "#,##0.00";
    sheet.getCell(`D${r}`).dataValidation = {
      type: "decimal",
      operator: "greaterThanOrEqual",
      allowBlank: true,
      formulae: [0],
      showErrorMessage: true,
      errorTitle: "วงเงิน",
      error: "ตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง",
    };
  }

  const help = workbook.addWorksheet("คำอธิบาย");
  help.columns = [{ width: 24 }, { width: 100 }];
  const rows: [string, string][] = [
    ["หน่วยเจ้าของงบ", `${unit.name} ปีงบประมาณ ${year.year_be} (ไฟล์นี้นำเข้าได้ที่หน้าของหน่วยนี้เท่านั้น)`],
    ["แผนงาน", "ชื่อแผนงาน ถ้ายังไม่มีในระบบจะสร้างให้ ชื่อเดียวกันถือเป็นแผนงานเดียวกัน"],
    ["โครงการหรือกิจกรรม", "ชื่อโครงการหรือกิจกรรมภายใต้แผนงาน ถ้ายังไม่มีจะสร้างให้"],
    ["หมวดรายจ่าย", `เลือกจากรายการ: ${activeCats.join(", ")}`],
    ["วงเงิน (บาท)", "ตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง ใส่จุลภาคได้ เช่น 12,500.50"],
    ["แหล่งเงิน", `เลือกจากรายการ: ${activeSources.join(", ")}`],
    ["รายการที่มีอยู่แล้ว", "แผนงาน โครงการ หมวดรายจ่าย และแหล่งเงินเดียวกัน: วงเงินเท่าเดิม = ข้าม / ต่างจากเดิม = ปรับวงเงิน (เฉพาะรายการที่ยังไม่เริ่มจัดสรร)"],
    ["การตรวจ", "ระบบตรวจทุกแถวและแสดงตัวอย่างก่อนยืนยัน ถ้ามีแถวผิดแม้แถวเดียว จะไม่บันทึกทั้งไฟล์"],
  ];
  rows.forEach((r) => help.addRow(r));
  help.getColumn(1).font = { bold: true };
  help.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  return workbookResponse(workbook, `แม่แบบแผนงบประมาณ-${year.year_be}.xlsx`);
}
