"use server";

import { revalidatePath } from "next/cache";

import type { ImportPreviewResult, ImportPreviewRow } from "@/components/import-dialog";
import type { PickerItem } from "@/components/search-picker";
import { requireMenu } from "@/lib/auth/guards";
import {
  BUDGET_KINDS,
  PLAN_IMPORT_HEADERS,
  PLAN_IMPORT_MAX_ROWS,
  isUuid,
  parseMoney,
  planRowFromCells,
  type BudgetKind,
  type Recipient,
} from "@/lib/budget";
import { explainError, type ActionResult } from "@/lib/errors";
import { readUploadedSheet } from "@/lib/excel";
import { createClient } from "@/lib/supabase/server";

const MENU = "/app/budget";
const DENIED = "ท่านไม่มีสิทธิ์แก้ไขงบประมาณ";

function refresh() {
  revalidatePath(MENU, "layout");
}

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// ---------------------------------------------------------------
// รายการงบประมาณ
// ---------------------------------------------------------------
export type ItemInput = {
  id?: string | null;
  year?: string | null;
  unit?: string | null;
  parent?: string | null;
  kind: string;
  name?: string;
  code?: string;
  category?: string | null;
  source?: string | null;
  amount?: string;
  note?: string;
};

export async function saveBudgetItem(input: ItemInput): Promise<ActionResult & { id?: string }> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget) return { ok: false, error: DENIED };
  const kind = input.kind as BudgetKind;
  if (!BUDGET_KINDS.includes(kind)) return { ok: false, error: "ชั้นของรายการไม่ถูกต้อง" };
  let amount: string | null = null;
  if (kind === "category") {
    amount = parseMoney(input.amount ?? "");
    if (amount === null) return { ok: false, error: "วงเงินต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง" };
    if (!isUuid(input.category)) return { ok: false, error: "กรุณาเลือกหมวดรายจ่าย" };
    if (!isUuid(input.source)) return { ok: false, error: "กรุณาเลือกแหล่งเงิน" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_budget_item", {
    p_id: isUuid(input.id) ? input.id : null,
    p_year: isUuid(input.year) ? input.year : null,
    p_unit: isUuid(input.unit) ? input.unit : null,
    p_parent: isUuid(input.parent) ? input.parent : null,
    p_kind: kind,
    p_name: text(input.name, 200),
    p_code: text(input.code, 40),
    p_category: kind === "category" ? input.category : null,
    p_source: kind === "category" ? input.source : null,
    p_amount: amount,
    p_note: text(input.note, 500),
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: input.id ? "บันทึกการแก้ไขแล้ว" : "เพิ่มรายการแล้ว", id: data as string };
}

export async function setItemActive(id: string, active: boolean, reason: string): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget || !isUuid(id)) return { ok: false, error: DENIED };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_budget_item_active", {
    p_id: id,
    p_active: active === true,
    p_reason: text(reason, 1000),
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: active ? "เปิดใช้งานรายการแล้ว" : "ปิดใช้งานรายการแล้ว" };
}

// ---------------------------------------------------------------
// จัดสรร
// ---------------------------------------------------------------
export async function searchRecipients(unitId: string, q: string): Promise<PickerItem<Recipient>[]> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget || !isUuid(unitId)) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("budget_recipients", { p_unit: unitId, p_q: text(q, 100), p_limit: 30 });
  return ((data as Recipient[] | null) ?? []).map((r) => ({
    id: `${r.kind}:${r.id}`,
    label: r.name,
    detail: [r.detail, r.code].filter(Boolean).join(" · "),
    data: r,
  }));
}

export type AllocationInput = {
  item: string;
  fromUnit: string;
  recipient: string; // unit:<uuid> หรือ place:<uuid>
  round: string;
  date: string;
  amount: string;
  reduce: boolean;
  reference: string;
  note: string;
};

export async function allocateBudget(input: AllocationInput): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget || !isUuid(input.item) || !isUuid(input.fromUnit)) return { ok: false, error: DENIED };
  const [kind, id] = String(input.recipient ?? "").split(":");
  if (!isUuid(id) || (kind !== "unit" && kind !== "place")) return { ok: false, error: "กรุณาเลือกผู้รับการจัดสรร" };
  const amount = parseMoney(input.amount);
  if (amount === null || Number(amount) === 0) return { ok: false, error: "จำนวนเงินต้องมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง" };
  const round = Number(String(input.round ?? "").trim());
  if (!Number.isInteger(round) || round < 1 || round > 999) return { ok: false, error: "ครั้งที่ต้องเป็นตัวเลข 1 ถึง 999" };
  const date = isoDate(input.date);
  if (!date) return { ok: false, error: "กรุณากรอกวันที่จัดสรร" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("allocate_budget", {
    p_item: input.item,
    p_from_unit: input.fromUnit,
    p_to_unit: kind === "unit" ? id : null,
    p_to_place: kind === "place" ? id : null,
    p_round: round,
    p_date: date,
    p_amount: input.reduce ? `-${amount}` : amount,
    p_reference: text(input.reference, 200),
    p_note: text(input.note, 500),
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: input.reduce ? "บันทึกการปรับลดแล้ว" : "บันทึกการจัดสรรแล้ว" };
}

export async function cancelAllocation(id: string, reason: string): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget || !isUuid(id)) return { ok: false, error: DENIED };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_budget_allocation", { p_id: id, p_reason: text(reason, 500) });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "ยกเลิกการจัดสรรแล้ว" };
}

// ---------------------------------------------------------------
// คำขอโอนเปลี่ยนแปลง (ยื่นผ่านเครื่องอนุมัติกลาง)
// ---------------------------------------------------------------
export async function submitTransfer(input: { from: string; to: string; amount: string; reason: string }): Promise<ActionResult & { id?: string }> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget || !isUuid(input.from)) return { ok: false, error: DENIED };
  if (!isUuid(input.to)) return { ok: false, error: "กรุณาเลือกรายการปลายทาง" };
  const amount = parseMoney(input.amount);
  if (amount === null || Number(amount) === 0) return { ok: false, error: "จำนวนเงินที่โอนต้องมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_budget_transfer", {
    p_from: input.from,
    p_to: input.to,
    p_amount: amount,
    p_reason: text(input.reason, 1000),
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  revalidatePath("/app/approvals");
  return { ok: true, message: "ยื่นคำขอโอนแล้ว รอเจ้าคณะของหน่วยพิจารณา", id: data as string };
}

export async function resubmitTransfer(id: string, amountText: string, reason: string): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget || !isUuid(id)) return { ok: false, error: DENIED };
  const amount = parseMoney(amountText);
  if (amount === null || Number(amount) === 0) return { ok: false, error: "จำนวนเงินที่โอนต้องมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_budget_transfer", { p_id: id, p_amount: amount, p_reason: text(reason, 1000) });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  revalidatePath("/app/approvals", "layout");
  return { ok: true, message: "ส่งคำขอโอนอีกครั้งแล้ว" };
}

// ---------------------------------------------------------------
// นำเข้าแผนงบจาก Excel (กล่องนำเข้ากลาง)
// ---------------------------------------------------------------
type RawRows = { rowNumber: number; cells: string[] }[];

const cleanRaw = (raw: unknown): RawRows =>
  (Array.isArray(raw) ? raw : []).slice(0, PLAN_IMPORT_MAX_ROWS + 1).map((r) => ({
    rowNumber: Number((r as { rowNumber?: unknown })?.rowNumber) || 0,
    cells: Array.isArray((r as { cells?: unknown })?.cells)
      ? (r as { cells: unknown[] }).cells.map((c) => String(c ?? "").slice(0, 600))
      : [],
  }));

const STATUS_MAP: Record<string, ImportPreviewRow["status"]> = { new: "new", update: "new", skip: "skip", error: "error" };

export async function previewPlanImport(yearId: string, unitId: string, formData: FormData): Promise<ImportPreviewResult<RawRows>> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget || !isUuid(yearId) || !isUuid(unitId)) return { ok: false, error: DENIED };
  const sheet = await readUploadedSheet(formData, PLAN_IMPORT_HEADERS, PLAN_IMPORT_MAX_ROWS);
  if (!sheet.ok) return sheet;
  const rows = sheet.rows.map((r) => planRowFromCells(r.rowNumber, r.cells));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_budget_plan_import", { p_year: yearId, p_unit: unitId, p_rows: rows });
  if (error) return { ok: false, error: explainError(error) };
  const byRow = new Map(((data as { row_no: number; status: string; message: string }[]) ?? []).map((c) => [c.row_no, c]));
  return {
    ok: true,
    payload: sheet.rows,
    rows: rows.map((r) => {
      const c = byRow.get(r.row_no);
      return {
        rowNumber: r.row_no,
        cells: [r.program, r.project, r.category, r.amount, r.source],
        status: STATUS_MAP[c?.status ?? "error"] ?? "error",
        message: c?.message ?? "ไม่พบผลตรวจ",
      };
    }),
  };
}

export async function confirmPlanImport(yearId: string, unitId: string, raw: RawRows): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget || !isUuid(yearId) || !isUuid(unitId)) return { ok: false, error: DENIED };
  const clean = cleanRaw(raw);
  if (clean.length === 0 || clean.length > PLAN_IMPORT_MAX_ROWS) return { ok: false, error: "ไม่มีข้อมูลให้นำเข้า" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_budget_plan", {
    p_year: yearId,
    p_unit: unitId,
    p_rows: clean.map((r) => planRowFromCells(r.rowNumber, r.cells)),
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  const r = data as { programs: number; projects: number; items: number; updated: number; skipped: number };
  const n = (v: number) => Number(v ?? 0).toLocaleString("th-TH");
  return {
    ok: true,
    message: `นำเข้าแล้ว: แผนงานใหม่ ${n(r.programs)} โครงการใหม่ ${n(r.projects)} หมวดรายจ่ายใหม่ ${n(r.items)} ปรับวงเงิน ${n(r.updated)} ข้าม ${n(r.skipped)} รายการ`,
  };
}

// ---------------------------------------------------------------
// ตั้งค่า (ผู้ดูแลระบบ): ปีงบประมาณ แหล่งเงิน หมวดรายจ่าย  (RLS ยอมเฉพาะผู้ดูแลระบบ)
// ---------------------------------------------------------------
export async function addFiscalYear(yearText: string, note: string): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.isAdmin) return { ok: false, error: "เพิ่มปีงบประมาณได้เฉพาะผู้ดูแลระบบ" };
  const year = Number(String(yearText ?? "").trim());
  if (!Number.isInteger(year) || year < 2500 || year > 2700) return { ok: false, error: "ปีงบประมาณต้องเป็นปี พ.ศ. 4 หลัก" };
  const supabase = await createClient();
  // วันเริ่มต้นและวันสิ้นสุดคำนวณโดย trigger ในฐานข้อมูล (1 ต.ค. ปีก่อน ถึง 30 ก.ย.)
  const { error } = await supabase.from("fiscal_years").insert({
    year_be: year,
    starts_on: `${year - 544}-10-01`,
    ends_on: `${year - 543}-09-30`,
    note: text(note, 500),
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: `มีปีงบประมาณ ${year} แล้ว` };
    return { ok: false, error: explainError(error) };
  }
  refresh();
  return { ok: true, message: `เพิ่มปีงบประมาณ ${year} แล้ว` };
}

export async function setFiscalYearStatus(id: string, status: "open" | "closed"): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.isAdmin || !isUuid(id) || (status !== "open" && status !== "closed")) {
    return { ok: false, error: "เปิดหรือปิดปีงบประมาณได้เฉพาะผู้ดูแลระบบ" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("fiscal_years").update({ status }).eq("id", id).select("year_be");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ไม่พบปีงบประมาณ" };
  refresh();
  return { ok: true, message: status === "closed" ? "ปิดปีงบประมาณแล้ว" : "เปิดปีงบประมาณแล้ว" };
}

export async function saveBudgetOption(
  table: "sources" | "categories",
  id: string | null,
  input: { name: string; sort_order: string; is_active: boolean },
): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.isAdmin) return { ok: false, error: "แก้ไขได้เฉพาะผู้ดูแลระบบ" };
  if (table !== "sources" && table !== "categories") return { ok: false, error: "ไม่พบรายการ" };
  const name = text(input.name, 100).replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "กรุณากรอกชื่อ" };
  const sort = Number(input.sort_order) || 0;
  const supabase = await createClient();
  const tableName = table === "sources" ? "budget_sources" : "budget_categories";
  const values = { name, sort_order: sort, is_active: input.is_active !== false };
  const { data, error } = id
    ? await supabase.from(tableName).update(values).eq("id", id).select("id")
    : await supabase.from(tableName).insert(values).select("id");
  if (error) {
    if (error.code === "23505") return { ok: false, error: `มีชื่อ "${name}" แล้ว` };
    return { ok: false, error: explainError(error) };
  }
  if (!data?.length) return { ok: false, error: "แก้ไขได้เฉพาะผู้ดูแลระบบ" };
  refresh();
  return { ok: true, message: "บันทึกแล้ว" };
}
