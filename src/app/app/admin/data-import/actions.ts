"use server";

import { revalidatePath } from "next/cache";

import type { ImportPreviewResult } from "@/components/import-dialog";
import { requireAdmin } from "@/lib/auth/guards";
import {
  APPOINTMENT_IMPORT_HEADERS,
  IMPORT_MAX_ROWS,
  USER_IMPORT_HEADERS,
  USER_IMPORT_MAX_ROWS,
  VENUE_IMPORT_HEADERS,
  friendlyRowMessage,
  validateAppointmentRows,
  validateUserRows,
  validateVenueRows,
  type CheckedRow,
  type RawRow,
} from "@/lib/data-import";
import { explainError, type ActionResult } from "@/lib/errors";
import { readUploadedSheet } from "@/lib/excel";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/app/admin/data-import";

type DbResult = { rows: { row: number; status: "new" | "skip" | "error"; message: string }[]; errors: number; added: number; committed: boolean };

function cleanRaw(raw: RawRow[], max: number): RawRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > max) return null;
  return raw.map((r) => ({
    rowNumber: Number(r.rowNumber),
    cells: Array.isArray(r.cells) ? r.cells.map((c) => String(c ?? "")) : [],
  }));
}

/** รวมผลตรวจรูปแบบ (หน้าจอ) กับผลตรวจของฐานข้อมูล (ลองบันทึกแล้วย้อนกลับ) */
function merge<T>(checked: CheckedRow<T>[], db: DbResult | null) {
  const byRow = new Map((db?.rows ?? []).map((r) => [r.row, r]));
  return checked.map((r) => {
    const d = byRow.get(r.rowNumber);
    if (r.status === "error" || !d) return { rowNumber: r.rowNumber, cells: r.cells, status: r.status, message: r.message };
    return { rowNumber: r.rowNumber, cells: r.cells, status: d.status, message: friendlyRowMessage(d.message) };
  });
}

async function runDbImport(fn: "import_appointments" | "import_venues", data: unknown[], commit: boolean): Promise<DbResult> {
  const supabase = await createClient();
  const { data: result, error } = await supabase.rpc(fn, { p_rows: data, p_commit: commit });
  if (error) throw error;
  return result as DbResult;
}

// ------------------------------------------------------------------
// ตำแหน่ง
// ------------------------------------------------------------------
export async function previewAppointmentImport(formData: FormData): Promise<ImportPreviewResult<RawRow[]>> {
  try {
    await requireAdmin();
    const sheet = await readUploadedSheet(formData, APPOINTMENT_IMPORT_HEADERS, IMPORT_MAX_ROWS);
    if (!sheet.ok) return sheet;
    const checked = validateAppointmentRows(sheet.rows);
    const good = checked.filter((r) => r.data).map((r) => r.data!);
    const db = good.length ? await runDbImport("import_appointments", good, false) : null;
    return { ok: true, rows: merge(checked, db), payload: sheet.rows };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

export async function confirmAppointmentImport(raw: RawRow[]): Promise<ActionResult> {
  try {
    await requireAdmin();
    const rows = cleanRaw(raw, IMPORT_MAX_ROWS);
    if (!rows) return { ok: false, error: "ไม่มีข้อมูลให้นำเข้า" };
    const checked = validateAppointmentRows(rows);
    const bad = checked.filter((r) => r.status === "error").length;
    if (bad > 0) return { ok: false, error: `ยังมีแถวที่ผิด ${bad} แถว กรุณาแก้ไฟล์แล้วอัปโหลดใหม่` };
    const result = await runDbImport("import_appointments", checked.map((r) => r.data!), true);
    if (!result.committed) return { ok: false, error: `ยังมีแถวที่ผิด ${result.errors} แถว กรุณาตรวจใหม่` };
    revalidatePath(PAGE);
    return { ok: true, message: `นำเข้าตำแหน่งแล้ว ${result.added.toLocaleString("th-TH")} รายการ` };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

// ------------------------------------------------------------------
// สนามสอบ
// ------------------------------------------------------------------
export async function previewVenueImport(formData: FormData): Promise<ImportPreviewResult<RawRow[]>> {
  try {
    await requireAdmin();
    const sheet = await readUploadedSheet(formData, VENUE_IMPORT_HEADERS, IMPORT_MAX_ROWS);
    if (!sheet.ok) return sheet;
    const checked = validateVenueRows(sheet.rows);
    const good = checked.filter((r) => r.data).map((r) => r.data!);
    const db = good.length ? await runDbImport("import_venues", good, false) : null;
    return { ok: true, rows: merge(checked, db), payload: sheet.rows };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

export async function confirmVenueImport(raw: RawRow[]): Promise<ActionResult> {
  try {
    await requireAdmin();
    const rows = cleanRaw(raw, IMPORT_MAX_ROWS);
    if (!rows) return { ok: false, error: "ไม่มีข้อมูลให้นำเข้า" };
    const checked = validateVenueRows(rows);
    const bad = checked.filter((r) => r.status === "error").length;
    if (bad > 0) return { ok: false, error: `ยังมีแถวที่ผิด ${bad} แถว กรุณาแก้ไฟล์แล้วอัปโหลดใหม่` };
    const result = await runDbImport("import_venues", checked.map((r) => r.data!), true);
    if (!result.committed) return { ok: false, error: `ยังมีแถวที่ผิด ${result.errors} แถว กรุณาตรวจใหม่` };
    revalidatePath(PAGE);
    return { ok: true, message: `นำเข้าสนามสอบแล้ว ${result.added.toLocaleString("th-TH")} สนาม` };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

// ------------------------------------------------------------------
// ผู้ใช้
// การสร้างบัญชีต้องใช้ createAdminClient (secret key) เพราะระบบบัญชีของ Supabase สร้างผู้ใช้ในนามผู้ดูแลระบบไม่ได้
// สิทธิ์ตรวจด้วย requireAdmin ก่อนทุกครั้ง ส่วนการให้บทบาทเรียก grant_user_role ในนามผู้ดูแลระบบ (บันทึก audit ตามปกติ)
// ------------------------------------------------------------------
async function checkUsers(rows: RawRow[]) {
  const supabase = await createClient();
  const { data: roles, error: roleError } = await supabase.from("roles").select("key, name, requires_org_unit");
  if (roleError) throw roleError;
  const checked = validateUserRows(rows, roles ?? []);
  const good = checked.filter((r) => r.data);

  const codes = [...new Set(good.map((r) => r.data!.unit_code).filter(Boolean))];
  const units = new Map<string, string>();
  if (codes.length) {
    const { data, error } = await supabase.from("org_units").select("id, code").in("code", codes).eq("is_active", true);
    if (error) throw error;
    for (const u of data ?? []) units.set(u.code, u.id);
  }
  const emails = good.map((r) => r.data!.email);
  const existing = new Set<string>();
  if (emails.length) {
    const admin = createAdminClient();
    const { data, error } = await admin.from("profiles").select("email").in("email", emails);
    if (error) throw error;
    for (const p of data ?? []) existing.add(String(p.email).toLowerCase());
  }
  return checked.map((r) => {
    if (!r.data) return { ...r, unitId: null as string | null };
    if (r.data.unit_code && !units.has(r.data.unit_code)) {
      return { ...r, status: "error" as const, message: "ไม่พบรหัสเขตปกครองนี้", unitId: null };
    }
    if (existing.has(r.data.email)) return { ...r, status: "skip" as const, message: "มีบัญชีอีเมลนี้อยู่แล้ว", unitId: null };
    return { ...r, unitId: r.data.unit_code ? units.get(r.data.unit_code)! : null };
  });
}

export async function previewUserImport(formData: FormData): Promise<ImportPreviewResult<RawRow[]>> {
  try {
    await requireAdmin();
    const sheet = await readUploadedSheet(formData, USER_IMPORT_HEADERS, USER_IMPORT_MAX_ROWS);
    if (!sheet.ok) return sheet;
    const rows = await checkUsers(sheet.rows);
    return {
      ok: true,
      rows: rows.map(({ rowNumber, cells, status, message }) => ({ rowNumber, cells, status, message })),
      payload: sheet.rows,
    };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

export async function confirmUserImport(raw: RawRow[]): Promise<ActionResult> {
  try {
    await requireAdmin();
    const clean = cleanRaw(raw, USER_IMPORT_MAX_ROWS);
    if (!clean) return { ok: false, error: "ไม่มีข้อมูลให้นำเข้า" };
    const rows = await checkUsers(clean);
    const bad = rows.filter((r) => r.status === "error").length;
    if (bad > 0) return { ok: false, error: `ยังมีแถวที่ผิด ${bad} แถว กรุณาแก้ไฟล์แล้วอัปโหลดใหม่` };
    const fresh = rows.filter((r) => r.status === "new");
    if (fresh.length === 0) return { ok: false, error: "ไม่มีผู้ใช้ใหม่ให้นำเข้า" };

    const admin = createAdminClient();
    const supabase = await createClient();
    let done = 0;
    for (const r of fresh) {
      const d = r.data!;
      // ไม่ตั้งรหัสผ่าน: ผู้ใช้ตั้งเองผ่าน ลืมรหัสผ่าน (ลิงก์ทางอีเมล) ระบบจึงไม่ต้องส่งต่อรหัสผ่านให้ใคร
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email: d.email, email_confirm: true });
      if (createError || !created.user) {
        return { ok: false, error: `แถว ${r.rowNumber}: ${explainError(createError)} (สร้างไปแล้ว ${done} บัญชี อัปโหลดไฟล์เดิมซ้ำได้ แถวที่สร้างแล้วจะถูกข้าม)` };
      }
      const userId = created.user.id;
      const now = new Date().toISOString();
      const { error: profileError } = await admin.from("profiles").insert({
        id: userId,
        title_prefix: d.title_prefix,
        first_name: d.first_name,
        monastic_name: d.monastic_name,
        last_name: d.last_name,
        phone: d.phone,
        email: d.email,
        status: "active",
        activated_at: now,
      });
      const { error: roleError } = profileError
        ? { error: profileError }
        : await supabase.rpc("grant_user_role", { p_user_id: userId, p_role_key: d.role_key, p_org_unit_id: r.unitId });
      if (profileError || roleError) {
        await admin.auth.admin.deleteUser(userId);
        return { ok: false, error: `แถว ${r.rowNumber}: ${explainError(profileError ?? roleError)} (สร้างไปแล้ว ${done} บัญชี)` };
      }
      done += 1;
    }
    revalidatePath(PAGE);
    revalidatePath("/app/admin/users");
    return {
      ok: true,
      message: `สร้างบัญชีแล้ว ${done.toLocaleString("th-TH")} บัญชี แจ้งผู้ใช้ให้ตั้งรหัสผ่านเองที่หน้า เข้าสู่ระบบ > ลืมรหัสผ่าน`,
    };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}
