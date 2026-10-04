"use server";

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
import { explainError as explain, type ActionResult } from "@/lib/errors";
import { readUploadedSheet } from "@/lib/excel";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/app/admin/org-units";
const COLUMNS = "id, parent_id, level, sect, name, code, is_active";

export type { ActionResult };

async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (error) {
    return { ok: false, error: explain(error) };
  }
}

export async function fetchOrgUnits(): Promise<OrgUnit[]> {
  const supabase = await createClient();
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

    const supabase = await createClient();
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

    const supabase = await createClient();
    const { error } = await supabase.from("org_units").update({ name, code }).eq("id", input.id);
    if (error) return { ok: false, error: explain(error) };
    revalidatePath(PAGE);
    return { ok: true, message: `บันทึก "${name}" แล้ว` };
  });
}

/** ปิดหรือเปิดใช้งาน (ไม่ลบข้อมูลจริง) */
export async function setOrgUnitActive(id: string, isActive: boolean): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient();
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

function count(rows: ImportRow[]) {
  return {
    new: rows.filter((r) => r.status === "new").length,
    skip: rows.filter((r) => r.status === "skip").length,
    error: rows.filter((r) => r.status === "error").length,
  };
}

export async function previewImport(formData: FormData): Promise<ImportPreview> {
  try {
    const sheet = await readUploadedSheet(formData, IMPORT_HEADERS, IMPORT_MAX_ROWS);
    if (!sheet.ok) return sheet;
    const raw: ImportRawRow[] = sheet.rows.map(({ rowNumber, cells }) => ({
      rowNumber,
      code: cells[0],
      name: cells[1],
      level: cells[2],
      sect: cells[3],
      parentCode: cells[4],
    }));

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

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("import_org_units", { p_rows: payload });
    if (error) return { ok: false, error: explain(error) };
    revalidatePath(PAGE);
    return { ok: true, message: `นำเข้าแล้ว ${Number(data).toLocaleString("th-TH")} หน่วย` };
  });
}
