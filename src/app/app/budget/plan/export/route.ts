import ExcelJS from "exceljs";

import { KIND_LABEL, buildBudgetTree, flattenTree, treeTotals } from "@/lib/budget";
import { fetchBudgetTree } from "@/lib/budget-server";
import { workbookResponse } from "@/lib/excel";

import { loadBudgetScope } from "../../scope";

/** ส่งออกต้นไม้งบประมาณของหน่วยที่เลือกเป็น Excel (จำนวนเงินเป็นตัวเลข ทศนิยม 2 ตำแหน่ง) */
export async function GET(request: Request) {
  const search = Object.fromEntries(new URL(request.url).searchParams);
  const { year, unit } = await loadBudgetScope(search);
  if (!year || !unit) {
    return new Response("ท่านไม่มีสิทธิ์ดูงบประมาณของหน่วยนี้", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const showInactive = search.inactive === "1";
  const tree = buildBudgetTree(await fetchBudgetTree(year.id, unit.id, showInactive));
  const totals = treeTotals(tree.filter((n) => n.is_active));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("แผนงบประมาณ", { views: [{ state: "frozen", ySplit: 3 }] });
  sheet.getCell("A1").value = `แผนงบประมาณ ${unit.name} ปีงบประมาณ ${year.year_be}`;
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getRow(3).values = ["ชั้น", "รหัส", "รายการ", "แหล่งเงิน", "หน่วยเจ้าของงบ", "วงเงิน (บาท)", "จัดสรรแล้ว", "คงเหลือ", "หมายเหตุ", "สถานะ"];
  sheet.getRow(3).font = { bold: true };
  sheet.columns = [18, 10, 48, 20, 28, 16, 16, 16, 30, 12].map((width) => ({ width }));
  const money = (v: number | string) => Number(v ?? 0);
  for (const n of flattenTree(tree)) {
    const row = sheet.addRow([
      KIND_LABEL[n.kind],
      n.code,
      `${"    ".repeat(n.depth)}${n.kind === "category" ? n.category_name ?? n.label : n.label}`,
      n.source_name ?? "",
      n.owner_unit_name,
      money(n.received),
      money(n.allocated),
      money(n.remaining),
      n.note,
      n.is_active ? "ใช้งาน" : "ปิดใช้งาน",
    ]);
    if (n.kind === "program") row.font = { bold: true };
  }
  const total = sheet.addRow(["รวม", "", "", "", "", totals.received, totals.allocated, totals.remaining]);
  total.font = { bold: true };
  for (const col of ["F", "G", "H"]) sheet.getColumn(col).numFmt = "#,##0.00";
  return workbookResponse(workbook, `แผนงบประมาณ-${year.year_be}-${unit.code || "หน่วย"}.xlsx`);
}
