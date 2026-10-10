import ExcelJS from "exceljs";

import { isUuid } from "@/lib/budget";
import { MOVE_KIND_LABEL } from "@/lib/inventory";
import { fetchStock, fetchStockCard } from "@/lib/inventory-server";
import { workbookResponse } from "@/lib/excel";
import { thaiDate } from "@/lib/thai";

import { loadInventory } from "../../scope";
import { cardTotals } from "../card-table";

const denied = () =>
  new Response("ไม่พบวัสดุ หรือท่านไม่มีสิทธิ์ดูคลังนี้", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** ส่งออก Stock Card ของวัสดุในคลัง (จำนวนเป็นตัวเลข) */
export async function GET(request: Request) {
  const search = Object.fromEntries(new URL(request.url).searchParams);
  const { warehouse } = await loadInventory(search);
  if (!warehouse || !isUuid(search.item)) return denied();
  const item = (await fetchStock(warehouse.id)).find((s) => s.item_id === search.item);
  const rows = item ? await fetchStockCard(warehouse.id, item.item_id) : null;
  if (!item || !rows) return denied();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Stock Card", { views: [{ state: "frozen", ySplit: 4 }] });
  sheet.getCell("A1").value = `บัญชีวัสดุ (Stock Card) ${item.code} ${item.name}`;
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = `${warehouse.name} · ${warehouse.unit_name} · หน่วยนับ ${item.unit}`;
  sheet.getRow(4).values = ["วันที่", "ประเภท", "รายการ", "เอกสารอ้างอิง", "รับ", "จ่าย", "คงเหลือ", "ราคาต่อหน่วย"];
  sheet.getRow(4).font = { bold: true };
  sheet.columns = [14, 12, 48, 22, 12, 12, 12, 14].map((width) => ({ width }));
  const n = (v: number | string | null) => (v === null ? null : Number(v));
  for (const r of rows) {
    sheet.addRow([
      thaiDate(r.moved_on, "short"),
      MOVE_KIND_LABEL[r.kind] ?? r.kind,
      r.note,
      r.reference_no,
      n(r.received) || null,
      n(r.issued) || null,
      n(r.balance),
      n(r.unit_price),
    ]);
  }
  const t = cardTotals(rows);
  sheet.addRow(["รวม", "", "", "", t.received, t.issued, t.balance, null]).font = { bold: true };
  for (const col of ["E", "F", "G"]) sheet.getColumn(col).numFmt = "#,##0.##";
  sheet.getColumn("H").numFmt = "#,##0.00";
  return workbookResponse(workbook, `stock-card-${warehouse.code}-${item.code}.xlsx`);
}
