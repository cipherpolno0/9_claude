"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { explainError, type ActionResult } from "@/lib/errors";
import {
  FORMS_TAG,
  columnsProblem,
  isColumnType,
  isExamType,
  sheetNameProblem,
  type FormColumn,
  type SignatureSlot,
} from "@/lib/exam-forms";
import { signaturesProblem } from "@/lib/exam-lists";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/app/admin/form-templates";
const UUID = /^[0-9a-f-]{36}$/i;
const ACTIVE_DUPLICATE = "มีแบบที่ใช้งานอยู่ของประเภทและชั้นนี้แล้ว ให้ปิดใช้งานแบบเดิมก่อน";

function refresh() {
  revalidatePath(PAGE, "layout");
  revalidatePath("/downloads", "layout");
  revalidateTag(FORMS_TAG, { expire: 0 });
}

export type TemplateInput = {
  code: string;
  sheet_name: string;
  title: string;
  notice: string;
  version: string;
  marker_code: string;
  marker_no: number | null;
  columns: FormColumn[];
  signatures: SignatureSlot[];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v : "").slice(0, max);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** เก็บเฉพาะช่องที่รู้จักของคอลัมน์ (กันข้อมูลแปลกปลอมจากหน้าจอ) */
function cleanColumn(raw: FormColumn): FormColumn {
  const type = isColumnType(raw.type) ? raw.type : "text";
  const col: FormColumn = {
    key: str(raw.key, 40).trim(),
    label: str(raw.label, 100).trim(),
    top: str(raw.top, 200),
    top_span: Math.trunc(num(raw.top_span) ?? 1),
    bottom: str(raw.bottom, 200),
    type,
    required: raw.required === true,
    width: Math.round((num(raw.width) ?? 10) * 10) / 10,
  };
  if (type === "number" || type === "year") {
    col.min = num(raw.min);
    col.max = num(raw.max);
  }
  if (type === "list") col.options = (Array.isArray(raw.options) ? raw.options : []).map((o) => str(o, 100).trim()).filter(Boolean);
  for (const k of ["help_title", "help", "error_title", "error", "header_help_title", "header_help", "example"] as const) {
    const v = str(raw[k], 255);
    if (v.trim()) col[k] = v;
  }
  return col;
}

/** บันทึกแบบฟอร์ม (RLS ยอมให้เฉพาะผู้ดูแลระบบ ฐานข้อมูลตรวจโครงสร้างซ้ำด้วย trigger form_templates_check) */
export async function saveFormTemplate(id: string, input: TemplateInput): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: "ไม่พบแบบฟอร์มนี้" };
  const columns = (Array.isArray(input.columns) ? input.columns : []).map(cleanColumn);
  // ช่องลงนาม: เก็บเฉพาะข้อความ ตัดบรรทัดว่างหัวท้าย (ฐานข้อมูลตรวจซ้ำด้วย trigger form_templates_signatures_check)
  const signatures: SignatureSlot[] = (Array.isArray(input.signatures) ? input.signatures : [])
    .map((x) => ({ text: str(x?.text, 400).replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "") }))
    .filter((x) => x.text.trim() !== "");
  const problem =
    (!input.code?.trim() || input.code.length > 20 ? "กรุณากรอกรหัสแบบ (ไม่เกิน 20 ตัวอักษร)" : null) ??
    (!input.title?.trim() || input.title.length > 200 ? "กรุณากรอกชื่อบัญชี (ไม่เกิน 200 ตัวอักษร)" : null) ??
    sheetNameProblem(input.sheet_name ?? "") ??
    ((input.notice ?? "").length > 500 ? "ข้อความเตือนยาวเกิน 500 ตัวอักษร" : null) ??
    ((input.version ?? "").length > 30 ? "รุ่นของแบบยาวเกิน 30 ตัวอักษร" : null) ??
    columnsProblem(columns) ??
    signaturesProblem(signatures);
  if (problem) return { ok: false, error: problem };

  const markerNo = input.marker_no === null || input.marker_no === undefined ? null : Number(input.marker_no);
  if (markerNo !== null && (!Number.isInteger(markerNo) || markerNo < 0 || markerNo > 999)) {
    return { ok: false, error: "เลขแฟ้ม (แถว 1) ต้องเป็นเลขจำนวนเต็ม 0 ถึง 999" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_templates")
    .update({
      code: input.code.trim(),
      sheet_name: input.sheet_name.trim(),
      title: input.title.trim(),
      notice: input.notice ?? "",
      version: (input.version ?? "").trim(),
      marker_code: (input.marker_code ?? "").trim().slice(0, 20),
      marker_no: markerNo,
      columns,
      signatures,
    })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์แก้ไขแบบฟอร์ม" };
  refresh();
  return { ok: true, message: "บันทึกแบบฟอร์มแล้ว แม่แบบที่ดาวน์โหลดหลังจากนี้ใช้ค่าใหม่" };
}

export async function setFormTemplateActive(id: string, active: boolean): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: "ไม่พบแบบฟอร์มนี้" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("form_templates").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { ok: false, error: error.code === "23505" ? ACTIVE_DUPLICATE : explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์แก้ไขแบบฟอร์ม" };
  refresh();
  return { ok: true, message: active ? "เปิดใช้งานแบบฟอร์มแล้ว" : "ปิดใช้งานแบบฟอร์มแล้ว" };
}

/** คัดลอกเป็นแบบใหม่ (ปิดใช้งานไว้ก่อน) ใช้เตรียมแบบรุ่นใหม่โดยไม่กระทบแบบที่ใช้อยู่ */
export async function copyFormTemplate(id: string): Promise<ActionResult & { id?: string }> {
  if (!UUID.test(id)) return { ok: false, error: "ไม่พบแบบฟอร์มนี้" };
  const supabase = await createClient();
  const { data: src } = await supabase
    .from("form_templates")
    .select("code, exam_type, level, sheet_name, marker_code, marker_no, version, notice, title, header_cells, columns, layout, signatures, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (!src) return { ok: false, error: "ไม่พบแบบฟอร์มนี้" };
  const { data, error } = await supabase
    .from("form_templates")
    .insert({ ...src, is_active: false })
    .select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์เพิ่มแบบฟอร์ม" };
  refresh();
  return { ok: true, message: "คัดลอกเป็นแบบใหม่แล้ว (ปิดใช้งานไว้ก่อน)", id: data[0].id as string };
}

const TITLE_DUPLICATE = "มีคำนำหน้านี้ในรายการแล้ว";

export async function addTitleOption(examType: string, name: string, sortOrder: number): Promise<ActionResult> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!isExamType(examType)) return { ok: false, error: "ไม่รู้จักประเภทการสอบนี้" };
  if (!clean || clean.length > 60) return { ok: false, error: "กรุณากรอกคำนำหน้า (ไม่เกิน 60 ตัวอักษร)" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("form_title_options")
    .insert({ exam_type: examType, name: clean, sort_order: Number.isInteger(sortOrder) ? sortOrder : 0 });
  if (error) return { ok: false, error: error.code === "23505" ? TITLE_DUPLICATE : explainError(error) };
  refresh();
  return { ok: true, message: `เพิ่ม "${clean}" แล้ว` };
}

export async function updateTitleOption(
  id: string,
  changes: { name?: string; isActive?: boolean; sortOrder?: number },
): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: "ไม่พบรายการนี้" };
  const row: Record<string, string | number | boolean> = {};
  if (changes.name !== undefined) {
    const clean = changes.name.trim().replace(/\s+/g, " ");
    if (!clean || clean.length > 60) return { ok: false, error: "กรุณากรอกคำนำหน้า (ไม่เกิน 60 ตัวอักษร)" };
    row.name = clean;
  }
  if (changes.isActive !== undefined) row.is_active = changes.isActive;
  if (changes.sortOrder !== undefined && Number.isInteger(changes.sortOrder)) row.sort_order = changes.sortOrder;
  const supabase = await createClient();
  const { data, error } = await supabase.from("form_title_options").update(row).eq("id", id).select("id");
  if (error) return { ok: false, error: error.code === "23505" ? TITLE_DUPLICATE : explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์ทำรายการนี้" };
  refresh();
  return { ok: true, message: "บันทึกแล้ว" };
}
