"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";

import {
  IMPORT_HEADERS,
  IMPORT_MAX_ROWS,
  SECTS,
  childLevelOf,
  validateImportRows,
  type ImportRawRow,
  type ImportRow,
  type OrgUnit,
  type Sect,
} from "@/lib/org-units";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE = "/app/admin/org-units";
const COLUMNS = "id, parent_id, level, sect, name, code, is_active";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** แปลงข้อผิดพลาดจากฐานข้อมูลเป็นข้อความภาษาไทยที่อ่านเข้าใจ */
function explain(error: { code?: string; message?: string } | null | unknown): string {
  const e = (error ?? {}) as { code?: string; message?: string };
  if (e.code === "23505") return "รหัสหน่วยนี้มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น";
  if (e.code === "23514" || e.code === "23503") return e.message ?? "ข้อมูลไม่ผ่านกติกาของระบบ";
  if (e.message?.includes("fetch failed")) return "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจค่าในไฟล์ .env.local";
  return e.message ? `เกิดข้อผิดพลาด: ${e.message}` : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
}

async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}

export async function fetchOrgUnits(): Promise<OrgUnit[]> {
  const supabase = createAdminClient();
  const all: OrgUnit[] = [];
  // อ่านทีละ 1,000 แถว เพราะ Supabase จำกัดจำนวนแถวต่อครั้ง
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("org_units")
      .select(COLUMNS)
      .order("code")
      .range(from, from + 999);
    if (error) throw error;
    all.push(...(data as OrgUnit[]));
    if (!data || data.length < 1000) break;
  }
  return all;
}

export async function createOrgUnit(input: {
  parentId: string | null;
  sect: string | null;
  name: string;
  code: string;
}): Promise<ActionResult> {
  return run(async () => {
    const name = input.name.trim();
    const code = input.code.trim();
    if (!name) return { ok: false, error: "กรุณากรอกชื่อหน่วย" };
    if (!code) return { ok: false, error: "กรุณากรอกรหัสหน่วย" };

    const supabase = createAdminClient();
    let row: { parent_id: string | null; level: string; sect: Sect | null; name: string; code: string };

    if (input.parentId === null) {
      row = { parent_id: null, level: "central", sect: null, name, code };
    } else {
      const { data: parent, error } = await supabase
        .from("org_units")
        .select(COLUMNS)
        .eq("id", input.parentId)
        .single();
      if (error || !parent) return { ok: false, error: "ไม่พบหน่วยเหนือที่เลือก" };
      const level = childLevelOf((parent as OrgUnit).level);
      if (!level) return { ok: false, error: "ตำบลเป็นระดับล่างสุด เพิ่มหน่วยใต้สังกัดไม่ได้" };
      const sect = ((parent as OrgUnit).sect ?? input.sect) as Sect | null;
      if (!sect || !SECTS.includes(sect)) return { ok: false, error: "กรุณาเลือกนิกาย" };
      row = { parent_id: input.parentId, level, sect, name, code };
    }

    const { error } = await supabase.from("org_units").insert(row);
    if (error) return { ok: false, error: explain(error) };
    revalidatePath(PAGE);
    return { ok: true, message: `เพิ่ม "${name}" แล้ว` };
  });
}

export async function updateOrgUnit(input: {
  id: string;
  name: string;
  code: string;
}): Promise<ActionResult> {
  return run(async () => {
    const name = input.name.trim();
    const code = input.code.trim();
    if (!name) return { ok: false, error: "กรุณากรอกชื่อหน่วย" };
    if (!code) return { ok: false, error: "กรุณากรอกรหัสหน่วย" };

    const supabase = createAdminClient();
    const { error } = await supabase.from("org_units").update({ name, code }).eq("id", input.id);
    if (error) return { ok: false, error: explain(error) };
    revalidatePath(PAGE);
    return { ok: true, message: `บันทึก "${name}" แล้ว` };
  });
}

/** ปิดหรือเปิดใช้งาน (ไม่ลบข้อมูลจริง) */
export async function setOrgUnitActive(id: string, isActive: boolean): Promise<ActionResult> {
  return run(async () => {
    const supabase = createAdminClient();
    const { error } = await supabase.from("org_units").update({ is_active: isActive }).eq("id", id);
    if (error) return { ok: false, error: explain(error) };
    revalidatePath(PAGE);
    return { ok: true, message: isActive ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว" };
  });
}

// ------------------------------------------------------------------
// นำเข้าจาก Excel: ขั้นที่ 1 อ่านและตรวจ (ยังไม่บันทึก) ขั้นที่ 2 ยืนยัน
// ------------------------------------------------------------------

export type ImportPreview =
  | { ok: true; rows: ImportRow[]; counts: { new: number; skip: number; error: number } }
  | { ok: false; error: string };

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text ?? "");
    if (value instanceof Date) return value.toISOString();
  }
  return String(value);
}

function count(rows: ImportRow[]) {
  return {
    new: rows.filter((r) => r.status === "new").length,
    skip: rows.filter((r) => r.status === "skip").length,
    error: rows.filter((r) => r.status === "error").length,
  };
}

export async function previewImport(formData: FormData): Promise<ImportPreview> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์ Excel" };
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return { ok: false, error: "รองรับเฉพาะไฟล์นามสกุล .xlsx" };
    }
    if (file.size > 4 * 1024 * 1024) return { ok: false, error: "ไฟล์ใหญ่เกิน 4 MB" };

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(await file.arrayBuffer());
    } catch {
      return { ok: false, error: "เปิดไฟล์ไม่ได้ กรุณาใช้แม่แบบที่ดาวน์โหลดจากหน้านี้" };
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) return { ok: false, error: "ไม่พบแผ่นงานในไฟล์" };

    const header = IMPORT_HEADERS.map((_, i) => cellText(sheet.getRow(1).getCell(i + 1).value).trim());
    if (header.some((h, i) => h !== IMPORT_HEADERS[i])) {
      return {
        ok: false,
        error: `หัวคอลัมน์แถวแรกไม่ตรงกับแม่แบบ ต้องเป็น: ${IMPORT_HEADERS.join(", ")}`,
      };
    }

    const raw: ImportRawRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const [code, name, level, sect, parentCode] = [1, 2, 3, 4, 5].map((c) =>
        cellText(row.getCell(c).value),
      );
      if (![code, name, level, sect, parentCode].some((v) => v.trim())) return;
      raw.push({ rowNumber, code, name, level, sect, parentCode });
    });

    if (raw.length === 0) return { ok: false, error: "ไม่พบข้อมูลในไฟล์ (มีแต่หัวคอลัมน์)" };
    if (raw.length > IMPORT_MAX_ROWS) {
      return { ok: false, error: `นำเข้าได้ครั้งละไม่เกิน ${IMPORT_MAX_ROWS.toLocaleString("th-TH")} แถว` };
    }

    const rows = validateImportRows(raw, await fetchOrgUnits());
    return { ok: true, rows, counts: count(rows) };
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}

export async function confirmImport(raw: ImportRawRow[]): Promise<ActionResult> {
  return run(async () => {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > IMPORT_MAX_ROWS) {
      return { ok: false, error: "ไม่มีข้อมูลให้นำเข้า" };
    }
    // ตรวจซ้ำฝั่งเซิร์ฟเวอร์เสมอ ไม่เชื่อผลตรวจที่ส่งมาจากหน้าจอ
    const rows = validateImportRows(
      raw.map((r) => ({
        rowNumber: Number(r.rowNumber),
        code: String(r.code ?? ""),
        name: String(r.name ?? ""),
        level: String(r.level ?? ""),
        sect: String(r.sect ?? ""),
        parentCode: String(r.parentCode ?? ""),
      })),
      await fetchOrgUnits(),
    );
    const counts = count(rows);
    if (counts.error > 0) return { ok: false, error: `ยังมีแถวที่ผิด ${counts.error} แถว กรุณาแก้ไฟล์แล้วอัปโหลดใหม่` };
    if (counts.new === 0) return { ok: false, error: "ไม่มีแถวใหม่ให้นำเข้า (ทุกรหัสมีในระบบแล้ว)" };

    const payload = rows
      .filter((r) => r.status === "new")
      .map((r) => ({
        code: r.code,
        name: r.name,
        level: r.level,
        sect: r.sect ?? "",
        parent_code: r.parentCode,
      }));

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("import_org_units", { p_rows: payload });
    if (error) return { ok: false, error: explain(error) };
    revalidatePath(PAGE);
    return { ok: true, message: `นำเข้าแล้ว ${Number(data).toLocaleString("th-TH")} หน่วย` };
  });
}
