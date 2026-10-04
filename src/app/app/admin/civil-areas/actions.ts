"use server";

import { revalidatePath } from "next/cache";

import type { ImportPreviewResult, ImportPreviewRow } from "@/components/import-dialog";
import { explainError, type ActionResult } from "@/lib/errors";
import { readUploadedSheet } from "@/lib/excel";
import { CIVIL_IMPORT_HEADERS, CIVIL_IMPORT_MAX_ROWS, type CivilImportData } from "@/lib/places";
import { fetchCivilRows } from "@/lib/places-server";
import { createClient } from "@/lib/supabase/server";

type Raw = { rowNumber: number; cells: string[] };
type Checked = ImportPreviewRow & { data: CivilImportData | null };

/** ตัดคำนำหน้าออกจากชื่อ (อำเภอ เขต ตำบล แขวง จังหวัด) เผื่อผู้กรอกพิมพ์ติดมา */
const strip = (name: string, prefixes: string[]) => {
  for (const p of prefixes) if (name.startsWith(p) && name.length > p.length) return name.slice(p.length).trim();
  return name;
};

async function checkRows(raw: Raw[]): Promise<Checked[]> {
  const existing = new Map((await fetchCivilRows()).map((r) => [r.subdistrict_code, r]));
  const seen = new Map<number, number>();
  return raw.map(({ rowNumber, cells }) => {
    const c = cells.map((v) => String(v ?? "").trim());
    const errors: string[] = [];
    const [pCode, dCode, sCode] = [c[0], c[2], c[4]];
    if (!/^\d{2}$/.test(pCode)) errors.push("รหัสจังหวัดต้องเป็นตัวเลข 2 หลัก");
    if (!/^\d{4}$/.test(dCode)) errors.push("รหัสอำเภอต้องเป็นตัวเลข 4 หลัก");
    if (!/^\d{6}$/.test(sCode)) errors.push("รหัสตำบลต้องเป็นตัวเลข 6 หลัก");
    if (errors.length === 0 && (!dCode.startsWith(pCode) || !sCode.startsWith(dCode))) {
      errors.push("รหัสไม่สัมพันธ์กัน (2 หลักแรกของรหัสอำเภอ = รหัสจังหวัด, 4 หลักแรกของรหัสตำบล = รหัสอำเภอ)");
    }
    if (!c[1] || !c[3] || !c[5]) errors.push("ต้องกรอกชื่อจังหวัด อำเภอ และตำบล");
    if (!/^\d{5}$/.test(c[6])) errors.push("รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก");
    const first = seen.get(Number(sCode));
    if (errors.length === 0 && first !== undefined) errors.push(`รหัสตำบลซ้ำกับแถวที่ ${first}`);
    if (errors.length > 0) return { rowNumber, cells, status: "error", message: errors.join(" / "), data: null };
    seen.set(Number(sCode), rowNumber);

    const bangkok = pCode === "10";
    const data: CivilImportData = {
      province_code: Number(pCode),
      province_name: strip(c[1], ["จังหวัด", "จ."]),
      district_code: Number(dCode),
      district_name: strip(c[3], bangkok ? ["เขต"] : ["อำเภอ", "อ."]),
      district_prefix: bangkok ? "เขต" : "อำเภอ",
      subdistrict_code: Number(sCode),
      subdistrict_name: strip(c[5], bangkok ? ["แขวง"] : ["ตำบล", "ต."]),
      subdistrict_prefix: bangkok ? "แขวง" : "ตำบล",
      postal_code: c[6],
    };
    const old = existing.get(data.subdistrict_code);
    if (!old) return { rowNumber, cells, status: "new", message: "", data };
    const same =
      old.province_name === data.province_name &&
      old.district_name === data.district_name &&
      old.subdistrict_name === data.subdistrict_name &&
      old.postal_code === data.postal_code;
    return same
      ? { rowNumber, cells, status: "skip", message: "ตรงกับข้อมูลในระบบแล้ว", data }
      : { rowNumber, cells, status: "new", message: "ปรับข้อมูลของรหัสที่มีอยู่", data };
  });
}

export async function previewCivilImport(formData: FormData): Promise<ImportPreviewResult<Raw[]>> {
  try {
    const sheet = await readUploadedSheet(formData, CIVIL_IMPORT_HEADERS, CIVIL_IMPORT_MAX_ROWS);
    if (!sheet.ok) return sheet;
    const rows = await checkRows(sheet.rows);
    return {
      ok: true,
      rows: rows.map(({ rowNumber, cells, status, message }) => ({ rowNumber, cells, status, message })),
      payload: sheet.rows,
    };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

export async function confirmCivilImport(raw: Raw[]): Promise<ActionResult> {
  try {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > CIVIL_IMPORT_MAX_ROWS) {
      return { ok: false, error: "ไม่มีข้อมูลให้นำเข้า" };
    }
    // ตรวจซ้ำฝั่งเซิร์ฟเวอร์เสมอ ไม่เชื่อผลตรวจที่ส่งมาจากหน้าจอ สิทธิ์ (เฉพาะผู้ดูแลระบบ) ตรวจในฐานข้อมูล
    const rows = await checkRows(
      raw.map((r) => ({
        rowNumber: Number(r.rowNumber),
        cells: Array.isArray(r.cells) ? r.cells.map((c) => String(c ?? "")) : [],
      })),
    );
    const errors = rows.filter((r) => r.status === "error").length;
    const fresh = rows.filter((r) => r.status === "new" && r.data);
    if (errors > 0) return { ok: false, error: `ยังมีแถวที่ผิด ${errors} แถว กรุณาแก้ไฟล์แล้วอัปโหลดใหม่` };
    if (fresh.length === 0) return { ok: false, error: "ไม่มีแถวใหม่ให้นำเข้า" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("import_civil_areas", { p_rows: fresh.map((r) => r.data) });
    if (error) return { ok: false, error: explainError(error) };
    revalidatePath("/app/admin/civil-areas");
    return { ok: true, message: `นำเข้าแล้ว ${Number(data).toLocaleString("th-TH")} ตำบล` };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}
