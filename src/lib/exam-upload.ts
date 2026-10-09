import "server-only";

import ExcelJS from "exceljs";

import { DATA_FIRST_ROW, columnLetter, type FormColumn, type FormTemplate } from "@/lib/exam-forms";

/**
 * อ่านไฟล์บัญชี ศ. (.xlsx) ที่ผู้ใช้อัปโหลด ที่ฝั่งเซิร์ฟเวอร์ (บทที่ 18)
 *  - ตรวจโครงแฟ้ม: เครื่องหมายแบบ (A1, B1) หัวคอลัมน์แถว 7-8 ปี พ.ศ. และรหัสสนามสอบในหัวแฟ้ม
 *    ผิดข้อใดข้อหนึ่ง = ไม่รับไฟล์ (ไม่สร้างชุด) เพราะอาจเป็นแฟ้มผิดแบบ ผิดชั้น หรือผิดสนาม
 *  - อ่านทุกแถวตั้งแต่แถว 9: ตัดช่องว่างหน้า-หลัง ยุบช่องว่างซ้อน แปลงเลขไทยเป็นเลขอารบิก
 *    วันที่ พ.ศ. (พิมพ์เป็นข้อความ หรือ Excel แปลงเป็นวันที่ให้) เป็น YYYY-MM-DD (ค.ศ.)
 *  - ค่าที่อ่านไม่ได้ส่งเป็นข้อผิดพลาดของช่องนั้น ส่วนการตรวจข้อมูลทุกข้อทำในฐานข้อมูล (create_registration_batch)
 */

export type UploadRow = {
  row_no: number;
  values: Record<string, string>;
  errors: { field: string; message: string }[];
};

export type ParsedUpload = { ok: true; rows: UploadRow[] } | { ok: false; errors: string[] };

export type UploadExpect = {
  yearBe: number;
  venueCode: string;
  maxRows: number;
};

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
/** ขนาดเมื่อแตกไฟล์รวมกันได้ไม่เกิน (กันไฟล์บีบอัดผิดปกติที่แตกออกมาใหญ่มาก) */
const MAX_UNZIPPED_BYTES = 150 * 1024 * 1024;
/** อ่านแถวได้ไกลสุด (กันไฟล์ที่มีแถวว่างจัดรูปแบบไว้เป็นแสนแถว) */
const MAX_SCAN_ROWS = 20000;

/** เลขไทยเป็นเลขอารบิก */
export const toArabicDigits = (text: string) => text.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));

/** ตัดช่องว่างหน้า-หลัง ยุบช่องว่างซ้อน ตัดอักขระล่องหน และแปลงเลขไทย */
export function cleanText(text: string): string {
  return toArabicDigits(text.replace(/[​-‍⁠﻿]/g, "").replace(/[\s ]+/g, " ").trim());
}

/** ตัดช่องว่างทั้งหมด ใช้เทียบหัวคอลัมน์ */
const squash = (text: string) => cleanText(text).replace(/\s+/g, "");

const pad2 = (n: number) => String(n).padStart(2, "0");

/** วัน เดือน ปี (ปี พ.ศ. 2400-2700 หรือ ค.ศ. 1900-2200) เป็น YYYY-MM-DD ค.ศ. หรือ null ถ้าไม่มีวันนั้นจริง */
export function toIsoDate(day: number, month: number, year: number): string | null {
  let y = year;
  if (y >= 2400 && y <= 2700) y -= 543;
  else if (y < 1900 || y > 2200) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(y, month - 1, day));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${y}-${pad2(month)}-${pad2(day)}`;
}

const MONTHS: string[][] = [
  ["มกราคม", "มค"],
  ["กุมภาพันธ์", "กพ"],
  ["มีนาคม", "มีค"],
  ["เมษายน", "เมย"],
  ["พฤษภาคม", "พค"],
  ["มิถุนายน", "มิย"],
  ["กรกฎาคม", "กค"],
  ["สิงหาคม", "สค"],
  ["กันยายน", "กย"],
  ["ตุลาคม", "ตค"],
  ["พฤศจิกายน", "พย"],
  ["ธันวาคม", "ธค"],
];

function monthFromName(name: string): number | null {
  const n = name.replace(/[.\s]/g, "");
  const i = MONTHS.findIndex((m) => m.includes(n));
  return i >= 0 ? i + 1 : null;
}

/** ข้อความวันที่ เช่น 1/1/2540, 01-01-2540, 1 ม.ค. 2540, 1 มกราคม 2540, 1997-01-01 */
export function parseDateText(raw: string): string | null {
  const s = cleanText(raw).replace(/^วันที่\s*/, "").replace(/\s*(พ\.?\s?ศ\.?|ค\.?\s?ศ\.?)\s*/g, " ").trim();
  let m = s.match(/^(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})$/);
  if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toIsoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{1,2})\s*([ก-๙.\s]+?)\s*(\d{4})$/);
  if (m) {
    const month = monthFromName(m[2]);
    return month ? toIsoDate(Number(m[1]), month, Number(m[3])) : null;
  }
  return null;
}

/** วันที่จาก Excel (ปีมากกว่า 2400 ถือว่าพิมพ์เป็น พ.ศ.) */
function dateFromExcel(d: Date): string | null {
  return toIsoDate(d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear());
}

/** เลขลำดับวันของ Excel (1 = 1 ม.ค. 1900) ใช้เมื่อช่องวันที่ไม่ได้จัดรูปแบบเป็นวันที่ */
function dateFromSerial(n: number): string | null {
  if (!Number.isFinite(n) || n < 3000 || n > 400000) return null;
  return dateFromExcel(new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000));
}

const DATE_HINT = "อ่านวันที่ไม่ได้ พิมพ์แบบ วัน/เดือน/ปี พ.ศ. เช่น 1/1/2540";

type CellRead = { text: string; error?: string };

function numberText(n: number): string {
  if (Number.isInteger(n)) return Number.isSafeInteger(n) ? String(n) : n.toLocaleString("fullwide", { useGrouping: false });
  return String(n);
}

/** ค่าในช่องหนึ่งตามชนิดของคอลัมน์ */
export function readCell(value: ExcelJS.CellValue, col: Pick<FormColumn, "key" | "type">): CellRead {
  if (value === null || value === undefined) return { text: "" };
  if (value instanceof Date) {
    if (col.type === "date") {
      const iso = dateFromExcel(value);
      return iso ? { text: iso } : { text: "", error: DATE_HINT };
    }
    // ช่องที่ไม่ใช่วันที่แต่ Excel แปลงเป็นวันที่ให้ เก็บเป็นข้อความ วัน/เดือน/ปี พ.ศ.
    return { text: `${value.getUTCDate()}/${value.getUTCMonth() + 1}/${value.getUTCFullYear() + 543}` };
  }
  if (typeof value === "number") {
    if (col.type === "date") {
      const iso = dateFromSerial(value);
      return iso ? { text: iso } : { text: "", error: DATE_HINT };
    }
    return { text: numberText(value) };
  }
  if (typeof value === "boolean") return { text: value ? "TRUE" : "FALSE" };
  if (typeof value === "string") {
    const text = cleanText(value);
    if (col.type === "date" && text) {
      const iso = parseDateText(text);
      return iso ? { text: iso } : { text: "", error: DATE_HINT };
    }
    if (col.type === "id" || col.type === "number" || col.type === "year") {
      // ตัวเลขที่พิมพ์ขึ้นต้นด้วย ' หรือมีช่องว่าง/ขีดคั่น
      return { text: text.replace(/^'/, "").replace(col.type === "id" ? /[\s-]/g : /\s/g, "") };
    }
    return { text };
  }
  if (typeof value === "object") {
    if ("error" in value) return { text: "", error: `ช่องนี้มีค่าผิดพลาด (${String(value.error)})` };
    if ("formula" in value || "sharedFormula" in value) {
      if (col.type === "id") return { text: "", error: "ห้ามใช้สูตร ให้พิมพ์เลขลงในช่องโดยตรง" };
      return readCell((value as { result?: ExcelJS.CellValue }).result ?? null, col);
    }
    if ("richText" in value) return readCell(value.richText.map((t) => t.text).join(""), col);
    if ("text" in value) return readCell(String(value.text ?? ""), col);
  }
  return { text: cleanText(String(value)) };
}

/** ข้อความของช่องในหัวแฟ้ม (ไม่สนชนิดข้อมูล) */
function headerText(value: ExcelJS.CellValue): string {
  return readCell(value, { key: "", type: "text" }).text;
}

/**
 * ตรวจขนาดเมื่อแตกไฟล์จากสารบัญของไฟล์ zip (.xlsx คือไฟล์ zip) โดยไม่ต้องแตกจริง
 * คืน null ถ้าไม่ใช่ไฟล์ zip ที่อ่านได้
 */
function unzippedSize(buf: Buffer): number | null {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    const entries = buf.readUInt16LE(i + 10);
    let p = buf.readUInt32LE(i + 16);
    let total = 0;
    for (let e = 0; e < entries; e++) {
      if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
      total += buf.readUInt32LE(p + 24);
      p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    }
    return total;
  }
  return null;
}

/** ชนิดไฟล์จากไบต์แรก */
export function fileKind(buf: Buffer): "xlsx" | "xls" | "other" {
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) return "xlsx";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return "xls";
  return "other";
}

/** อ่านไฟล์ตามแบบ ศ. ของรอบ */
export async function parseRegistrationFile(buf: Buffer, template: FormTemplate, expect: UploadExpect): Promise<ParsedUpload> {
  const kind = fileKind(buf);
  if (kind === "xls") {
    return { ok: false, errors: ["ไฟล์นี้เป็น Excel แบบเก่า (.xls) กรุณาเปิดใน Excel แล้วบันทึกเป็น .xlsx (Excel Workbook) ก่อนอัปโหลด"] };
  }
  const size = kind === "xlsx" ? unzippedSize(buf) : null;
  if (size === null) return { ok: false, errors: ["เปิดไฟล์ไม่ได้ ไฟล์อาจเสียหายหรือไม่ใช่ไฟล์ Excel (.xlsx)"] };
  if (size > MAX_UNZIPPED_BYTES) return { ok: false, errors: ["ไฟล์มีข้อมูลมากผิดปกติ กรุณาใช้แม่แบบที่ดาวน์โหลดจากระบบ"] };

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    return { ok: false, errors: ["เปิดไฟล์ไม่ได้ ไฟล์อาจเสียหายหรือไม่ใช่ไฟล์ Excel (.xlsx)"] };
  }

  // แผ่นงานตามชื่อในแบบ ถ้าไม่พบใช้แผ่นงานแรกที่ไม่ใช่แผ่นตัวอย่าง
  const sheet =
    workbook.getWorksheet(template.sheet_name) ??
    workbook.worksheets.find((s) => s.state === "visible" && s.name !== "ตัวอย่าง") ??
    workbook.worksheets[0];
  if (!sheet) return { ok: false, errors: ["ไม่พบแผ่นงานในไฟล์"] };

  const errors: string[] = [];
  const formName = template.code;

  // 1) เครื่องหมายแบบ ศ. (ตัวอักษรสีขาวในแถว 1 ของแม่แบบ)
  const markerCode = headerText(sheet.getCell("A1").value);
  const markerNo = headerText(sheet.getCell("B1").value);
  if (template.marker_code && (markerCode !== template.marker_code || (template.marker_no !== null && markerNo !== String(template.marker_no)))) {
    errors.push(
      `ไฟล์นี้ไม่ใช่แบบ ${formName} ของชั้นนี้ (เครื่องหมายแบบในช่อง A1-B1 ไม่ตรง) กรุณาใช้แม่แบบที่ดาวน์โหลดจากระบบสำหรับรอบนี้`,
    );
    return { ok: false, errors };
  }

  // 2) หัวคอลัมน์แถว 7 และ 8 (ไม่สนช่องว่าง)
  const topRow = DATA_FIRST_ROW - 2;
  let coveredUntil = 0;
  template.columns.forEach((col, i) => {
    const n = i + 1;
    const letter = columnLetter(n);
    if (n > coveredUntil) {
      const got = headerText(sheet.getCell(topRow, n).value);
      if (squash(got) !== squash(col.top)) {
        errors.push(
          col.top
            ? `หัวคอลัมน์ ${letter}${topRow} ต้องเป็น "${col.top}" แต่ในไฟล์เป็น "${got || "(ว่าง)"}"`
            : `หัวคอลัมน์ ${letter}${topRow} ต้องว่าง แต่ในไฟล์เป็น "${got}"`,
        );
      }
    }
    if (n > coveredUntil && col.top_span > 1) coveredUntil = n + col.top_span - 1;
    if (col.bottom) {
      const got = headerText(sheet.getCell(topRow + 1, n).value);
      if (squash(got) !== squash(col.bottom)) {
        errors.push(`หัวคอลัมน์ ${letter}${topRow + 1} ต้องเป็น "${col.bottom}" แต่ในไฟล์เป็น "${got || "(ว่าง)"}"`);
      }
    }
  });
  // คอลัมน์ที่เพิ่มต่อท้ายแบบ
  const extraCol = template.columns.length + 1;
  if ([topRow, topRow + 1].some((r) => headerText(sheet.getCell(r, extraCol).value))) {
    errors.push(`มีหัวคอลัมน์เกินจากแบบที่คอลัมน์ ${columnLetter(extraCol)}`);
  }
  if (errors.length) {
    return { ok: false, errors: [`หัวคอลัมน์ไม่ตรงกับแบบ ${formName} (ห้ามเพิ่ม ลบ หรือย้ายคอลัมน์)`, ...errors.slice(0, 10)] };
  }

  // 3) ปี พ.ศ. และรหัสสนามสอบในหัวแฟ้ม ต้องตรงกับรอบและสนามสอบที่เลือก
  for (const h of template.header_cells) {
    if (h.field !== "year_be" && h.field !== "venue_code") continue;
    const got = headerText(sheet.getCell(h.cell).value).replace(/\s/g, "");
    if (h.field === "year_be" && got !== String(expect.yearBe)) {
      errors.push(`ปี พ.ศ. ในหัวแฟ้ม (ช่อง ${h.cell}) ต้องเป็น ${expect.yearBe} แต่ในไฟล์เป็น "${got || "(ว่าง)"}"`);
    }
    if (h.field === "venue_code") {
      const want = expect.venueCode.trim();
      const same = got === want || (/^\d+$/.test(got) && /^\d+$/.test(want) && Number(got) === Number(want));
      if (!same) {
        errors.push(
          `รหัสสนามสอบในหัวแฟ้ม (ช่อง ${h.cell}) ต้องเป็น ${want} ตามสนามสอบที่เลือก แต่ในไฟล์เป็น "${got || "(ว่าง)"}"`,
        );
      }
    }
  }
  if (errors.length) return { ok: false, errors };

  // 4) รายชื่อ ตั้งแต่แถว 9 ข้ามแถวว่าง (แถวที่มีแต่เลขที่ถือว่าว่าง)
  const rows: UploadRow[] = [];
  const last = Math.min(sheet.rowCount, DATA_FIRST_ROW + MAX_SCAN_ROWS - 1);
  for (let r = DATA_FIRST_ROW; r <= last; r++) {
    const row = sheet.getRow(r);
    const values: Record<string, string> = {};
    const rowErrors: UploadRow["errors"] = [];
    let filled = false;
    template.columns.forEach((col, i) => {
      const read = readCell(row.getCell(i + 1).value, col);
      if (read.text) values[col.key] = read.text;
      if (read.error) rowErrors.push({ field: col.key, message: read.error });
      if ((read.text || read.error) && col.key !== "seq") filled = true;
    });
    if (!filled) continue;
    rows.push({ row_no: r, values, errors: rowErrors });
    if (rows.length > expect.maxRows) {
      return {
        ok: false,
        errors: [`ไฟล์มีผู้สมัครเกิน ${expect.maxRows.toLocaleString("th-TH")} แถว กรุณาแบ่งเป็นหลายไฟล์`],
      };
    }
  }
  if (rows.length === 0) return { ok: false, errors: [`ไม่พบรายชื่อผู้สมัครในไฟล์ (เริ่มกรอกที่แถว ${DATA_FIRST_ROW})`] };
  return { ok: true, rows };
}
