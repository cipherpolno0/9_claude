import "server-only";

import ExcelJS from "exceljs";

/** ตัวช่วยอ่านไฟล์ Excel ที่ผู้ใช้อัปโหลด ใช้ร่วมกันทุกหน้านำเข้า */

export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text ?? "");
  }
  return String(value);
}

export type SheetRows =
  | { ok: true; rows: { rowNumber: number; cells: string[] }[] }
  | { ok: false; error: string };

/**
 * อ่านแผ่นงานแรกของไฟล์ .xlsx ที่อัปโหลดผ่านฟอร์ม (ช่อง file)
 * ตรวจชนิดไฟล์ ขนาด หัวคอลัมน์แถวแรก และจำนวนแถว แล้วคืนข้อความของทุกช่อง (ข้ามแถวว่าง)
 */
export async function readUploadedSheet(
  formData: FormData,
  headers: readonly string[],
  maxRows: number,
): Promise<SheetRows> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์ Excel" };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { ok: false, error: "รองรับเฉพาะไฟล์นามสกุล .xlsx" };
  if (file.size > 4 * 1024 * 1024) return { ok: false, error: "ไฟล์ใหญ่เกิน 4 MB" };

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "เปิดไฟล์ไม่ได้ กรุณาใช้แม่แบบที่ดาวน์โหลดจากหน้านี้" };
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { ok: false, error: "ไม่พบแผ่นงานในไฟล์" };

  const header = headers.map((_, i) => cellText(sheet.getRow(1).getCell(i + 1).value).trim());
  if (header.some((h, i) => h !== headers[i])) {
    return { ok: false, error: `หัวคอลัมน์แถวแรกไม่ตรงกับแม่แบบ ต้องเป็น: ${headers.join(", ")}` };
  }

  const rows: { rowNumber: number; cells: string[] }[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells = headers.map((_, i) => cellText(row.getCell(i + 1).value));
    if (!cells.some((v) => v.trim())) return;
    rows.push({ rowNumber, cells });
  });

  if (rows.length === 0) return { ok: false, error: "ไม่พบข้อมูลในไฟล์ (มีแต่หัวคอลัมน์)" };
  if (rows.length > maxRows) {
    return { ok: false, error: `นำเข้าได้ครั้งละไม่เกิน ${maxRows.toLocaleString("th-TH")} แถว` };
  }
  return { ok: true, rows };
}

/** ส่งไฟล์ Excel ให้ดาวน์โหลด */
export async function workbookResponse(workbook: ExcelJS.Workbook, fileName: string): Promise<Response> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
