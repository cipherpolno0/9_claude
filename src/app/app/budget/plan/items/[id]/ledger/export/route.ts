import ExcelJS from "exceljs";

import { LEDGER_KIND_LABEL, isUuid } from "@/lib/budget";
import { fetchItemDetail, fetchLedger } from "@/lib/budget-server";
import { workbookResponse } from "@/lib/excel";
import { thaiDate } from "@/lib/thai";

import { loadBudgetScope } from "../../../../../scope";
import { ledgerTotals } from "../ledger-table";

const denied = () =>
  new Response("ไม่พบรายการ หรือท่านไม่มีสิทธิ์ดูทะเบียนคุมของหน่วยนี้", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** ส่งออกทะเบียนคุมงบประมาณของรายการในมุมมองของหน่วย (จำนวนเงินเป็นตัวเลข) */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return denied();
  const search = Object.fromEntries(new URL(request.url).searchParams);
  const { unit } = await loadBudgetScope(search);
  if (!unit) return denied();
  const item = await fetchItemDetail(id, unit.id);
  if (!item || item.kind !== "category") return denied();
  const rows = await fetchLedger(item.id, unit.id);
  if (!rows) return denied();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("ทะเบียนคุม", { views: [{ state: "frozen", ySplit: 4 }] });
  sheet.getCell("A1").value = `ทะเบียนคุมงบประมาณ ปีงบประมาณ ${item.year_be}`;
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = `${item.path} · ${unit.name}`;
  sheet.getRow(4).values = ["วันที่", "ประเภท", "รายการ", "อ้างอิง", "ได้รับจัดสรร", "ผูกพัน", "เบิกจ่าย", "คงเหลือ", "ค้างเบิก"];
  sheet.getRow(4).font = { bold: true };
  sheet.columns = [14, 16, 56, 24, 16, 16, 16, 16, 16].map((width) => ({ width }));
  const n = (v: number | string) => Number(v ?? 0);
  for (const r of rows) {
    sheet.addRow([
      thaiDate(r.happened_on, "short"),
      LEDGER_KIND_LABEL[r.kind] ?? r.kind,
      r.description,
      r.ref_no,
      n(r.received),
      n(r.committed),
      n(r.disbursed),
      n(r.balance),
      n(r.outstanding),
    ]);
  }
  const t = ledgerTotals(rows);
  sheet.addRow(["รวม", "", "", "", t.received, t.committed, t.disbursed, t.balance, t.outstanding]).font = { bold: true };
  for (const col of ["E", "F", "G", "H", "I"]) sheet.getColumn(col).numFmt = "#,##0.00";
  return workbookResponse(workbook, `ทะเบียนคุม-${item.year_be}-${item.label}-${unit.code || "หน่วย"}.xlsx`);
}
