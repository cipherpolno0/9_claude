"use server";

import ExcelJS from "exceljs";

import { getAuthContext } from "@/lib/auth/session";

/**
 * รายงานแถวที่ผิดของการนำเข้า (บทที่ 32) ใช้กับกล่องนำเข้ากลาง ImportDialog ทุกจุด
 * รับข้อมูลชุดเดียวกับที่หน้าจอแสดง (ผลตรวจที่ผู้ใช้เห็นอยู่แล้ว) สร้างเป็นไฟล์ Excel คืนเป็น base64
 * เลขประจำตัวประชาชนในรายงานแสดงเฉพาะ 4 ตัวท้าย
 */
export async function importErrorReport(input: {
  title: string;
  columns: string[];
  rows: { rowNumber: number; cells: string[]; message: string }[];
}): Promise<{ ok: true; base64: string; fileName: string } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };
  if (!Array.isArray(input.rows) || input.rows.length === 0 || input.rows.length > 5000) {
    return { ok: false, error: "ไม่มีแถวที่ผิด" };
  }
  const columns = (input.columns ?? []).slice(0, 40).map((c) => String(c).slice(0, 100));
  const idColumns = columns.map((c, i) => (c.includes("เลขประจำตัว") ? i : -1)).filter((i) => i >= 0);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("แถวที่ผิด");
  sheet.columns = [
    { header: "แถวในไฟล์", width: 10 },
    { header: "สาเหตุ", width: 60 },
    ...columns.map((header) => ({ header, width: Math.min(Math.max(header.length + 4, 12), 30) })),
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const r of input.rows) {
    const cells = columns.map((_, i) => {
      const v = String(r.cells?.[i] ?? "").slice(0, 1000);
      return idColumns.includes(i) && v.replace(/\D/g, "").length > 4 ? `xxxxxxxxx${v.replace(/\D/g, "").slice(-4)}` : v;
    });
    sheet.addRow([Number(r.rowNumber) || 0, String(r.message ?? "").slice(0, 1000), ...cells]);
  }
  sheet.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  const buffer = await workbook.xlsx.writeBuffer();
  const safeTitle = String(input.title ?? "นำเข้า").replace(/[\\/:*?"<>|]/g, "").slice(0, 80);
  return { ok: true, base64: Buffer.from(buffer as ArrayBuffer).toString("base64"), fileName: `แถวที่ผิด-${safeTitle}.xlsx` };
}
