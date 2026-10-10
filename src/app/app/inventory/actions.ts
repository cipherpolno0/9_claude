"use server";

import { revalidatePath } from "next/cache";

import { requireMenu } from "@/lib/auth/guards";
import { isUuid, parseMoney } from "@/lib/budget";
import { explainError, type ActionResult } from "@/lib/errors";
import { parseQty } from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";

/** คลังวัสดุ: ทุกการเขียนเรียกฟังก์ชันฐานข้อมูลที่ล็อกคลังและตรวจสิทธิ์ซ้ำ (หน้าเว็บตรวจรูปแบบเบื้องต้นเท่านั้น) */

const MENU = "/app/inventory";
const DENIED = "ท่านไม่มีสิทธิ์ทำรายการพัสดุของคลังนี้";
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function refresh() {
  revalidatePath(MENU, "layout");
  revalidatePath("/app/approvals", "layout");
}

export type LineInput = { item_id: string; quantity: string; unit_price?: string };

/** ตรวจรายการวัสดุหลายบรรทัด: ข้ามบรรทัดว่าง ห้ามซ้ำ จำนวน > 0 (ราคาเมื่อ withPrice) */
function cleanLines(
  lines: LineInput[],
  { withPrice = false }: { withPrice?: boolean } = {},
): { ok: true; lines: LineInput[] } | { ok: false; error: string } {
  const rows = (Array.isArray(lines) ? lines : []).filter((l) => text(l?.item_id, 40) || text(l?.quantity, 20));
  if (rows.length === 0) return { ok: false, error: "กรุณาเลือกวัสดุอย่างน้อย 1 รายการ" };
  if (rows.length > 100) return { ok: false, error: "ทำรายการได้ครั้งละไม่เกิน 100 รายการ" };
  const seen = new Set<string>();
  const out: LineInput[] = [];
  for (const [i, l] of rows.entries()) {
    if (!isUuid(l.item_id)) return { ok: false, error: `รายการที่ ${i + 1}: กรุณาเลือกวัสดุ` };
    if (seen.has(l.item_id)) return { ok: false, error: `รายการที่ ${i + 1}: เลือกวัสดุซ้ำกับรายการก่อนหน้า` };
    seen.add(l.item_id);
    const q = parseQty(text(l.quantity, 20));
    if (q === null || Number(q) <= 0) return { ok: false, error: `รายการที่ ${i + 1}: จำนวนต้องมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง` };
    if (withPrice) {
      const p = parseMoney(text(l.unit_price, 20));
      if (p === null) return { ok: false, error: `รายการที่ ${i + 1}: ราคาต่อหน่วยต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง (รับบริจาคใส่ 0 ได้)` };
      out.push({ item_id: l.item_id, quantity: q, unit_price: p });
    } else out.push({ item_id: l.item_id, quantity: q });
  }
  return { ok: true, lines: out };
}

/** จำนวนรายรายการของผู้อนุมัติ/ผู้จ่าย: ว่าง = ใช้ค่าเดิม (ให้ฐานข้อมูลเติม) */
function cleanQtyMap(lines: { item_id: string; value: string }[], key: "approved" | "issued") {
  const out: Record<string, string>[] = [];
  for (const l of Array.isArray(lines) ? lines : []) {
    if (!isUuid(l?.item_id)) continue;
    const raw = text(l.value, 20);
    if (raw === "") continue;
    const q = parseQty(raw);
    if (q === null) return { ok: false as const, error: "จำนวนต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง" };
    out.push({ item_id: l.item_id, [key]: q });
  }
  return { ok: true as const, lines: out };
}

// ---------- รับเข้า ----------
export async function receiveStock(input: {
  warehouse: string;
  source: string;
  receivedOn: string;
  documentNo: string;
  supplier: string;
  disbursement: string;
  note: string;
  lines: LineInput[];
}): Promise<ActionResult & { id?: string }> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditInventory || !isUuid(input.warehouse)) return { ok: false, error: DENIED };
  if (input.source !== "purchase" && input.source !== "donation") return { ok: false, error: "กรุณาเลือกที่มา" };
  const on = isoDate(input.receivedOn);
  if (!on) return { ok: false, error: "กรุณากรอกวันที่รับให้ครบ" };
  const lines = cleanLines(input.lines, { withPrice: true });
  if (!lines.ok) return lines;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_stock", {
    p_warehouse: input.warehouse,
    p_source: input.source,
    p_received_on: on,
    p_document_no: text(input.documentNo, 100),
    p_supplier: text(input.supplier, 200),
    p_disbursement: isUuid(input.disbursement) ? input.disbursement : null,
    p_note: text(input.note, 500),
    p_lines: lines.lines,
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "บันทึกรับเข้าแล้ว แนบใบส่งของได้ที่หน้านี้", id: data as string };
}

// ---------- ปรับยอด ----------
export async function adjustStock(input: { warehouse: string; item: string; quantity: string; reason: string; movedOn: string }): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditInventory || !isUuid(input.warehouse) || !isUuid(input.item)) return { ok: false, error: DENIED };
  const q = parseQty(text(input.quantity, 20), { allowNegative: true });
  if (q === null || Number(q) === 0) return { ok: false, error: "จำนวนที่ปรับต้องเป็นตัวเลข บวก = เพิ่ม ลบ = ลด ไม่เป็นศูนย์ ทศนิยมไม่เกิน 2 ตำแหน่ง" };
  const reason = text(input.reason, 500);
  if (reason.length < 3) return { ok: false, error: "กรุณาระบุเหตุผลการปรับยอด (อย่างน้อย 3 ตัวอักษร)" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_stock", {
    p_warehouse: input.warehouse,
    p_item: input.item,
    p_quantity: q,
    p_reason: reason,
    p_moved_on: isoDate(input.movedOn),
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "บันทึกการปรับยอดแล้ว" };
}

// ---------- ใบเบิก ----------
export async function submitRequisition(input: { warehouse: string; purpose: string; lines: LineInput[] }): Promise<ActionResult & { id?: string }> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canViewInventory || !isUuid(input.warehouse)) return { ok: false, error: "ท่านไม่มีสิทธิ์เบิกวัสดุจากคลังนี้" };
  const purpose = text(input.purpose, 1000);
  if (purpose.length < 3) return { ok: false, error: "กรุณาระบุวัตถุประสงค์การเบิก (อย่างน้อย 3 ตัวอักษร)" };
  const lines = cleanLines(input.lines);
  if (!lines.ok) return lines;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_requisition", { p_warehouse: input.warehouse, p_purpose: purpose, p_lines: lines.lines });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "ยื่นใบเบิกแล้ว รอผู้มีอำนาจอนุมัติ", id: data as string };
}

export async function resubmitRequisition(id: string, purpose: string, lines: LineInput[]): Promise<ActionResult> {
  await requireMenu(MENU);
  if (!isUuid(id)) return { ok: false, error: DENIED };
  const p = text(purpose, 1000);
  if (p.length < 3) return { ok: false, error: "กรุณาระบุวัตถุประสงค์การเบิก (อย่างน้อย 3 ตัวอักษร)" };
  const clean = cleanLines(lines);
  if (!clean.ok) return clean;
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_requisition", { p_id: id, p_purpose: p, p_lines: clean.lines });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "ส่งใบเบิกอีกครั้งแล้ว" };
}

/** ผู้พิจารณาบันทึกจำนวนที่อนุมัติรายรายการ (กดเห็นชอบ/อนุมัติที่ฟอร์มพิจารณากลางต่อ) */
export async function setRequisitionApproval(id: string, lines: { item_id: string; value: string }[]): Promise<ActionResult> {
  if (!isUuid(id)) return { ok: false, error: DENIED };
  const clean = cleanQtyMap(lines, "approved");
  if (!clean.ok) return clean;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_requisition_approval", { p_id: id, p_lines: clean.lines });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "บันทึกจำนวนที่อนุมัติแล้ว กดอนุมัติด้านล่างเพื่อยืนยัน" };
}

export async function issueRequisition(input: { id: string; lines: { item_id: string; value: string }[]; issuedOn: string; note: string }): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditInventory || !isUuid(input.id)) return { ok: false, error: DENIED };
  const on = isoDate(input.issuedOn);
  if (!on) return { ok: false, error: "กรุณากรอกวันที่จ่ายให้ครบ" };
  const clean = cleanQtyMap(input.lines, "issued");
  if (!clean.ok) return clean;
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_requisition", {
    p_id: input.id,
    p_lines: clean.lines,
    p_issued_on: on,
    p_note: text(input.note, 500),
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "บันทึกจ่ายของและตัดสต็อกแล้ว" };
}

// ---------- โอน ----------
export async function sendTransfer(input: { from: string; to: string; sentOn: string; note: string; lines: LineInput[] }): Promise<ActionResult & { id?: string }> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditInventory || !isUuid(input.from)) return { ok: false, error: DENIED };
  if (!isUuid(input.to)) return { ok: false, error: "กรุณาเลือกคลังปลายทาง" };
  const on = isoDate(input.sentOn);
  if (!on) return { ok: false, error: "กรุณากรอกวันที่โอนให้ครบ" };
  const lines = cleanLines(input.lines);
  if (!lines.ok) return lines;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_transfer", {
    p_from: input.from,
    p_to: input.to,
    p_sent_on: on,
    p_note: text(input.note, 500),
    p_lines: lines.lines,
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "บันทึกโอนออกแล้ว รอคลังปลายทางกดรับ", id: data as string };
}

export async function receiveTransfer(id: string, receivedOn: string): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditInventory || !isUuid(id)) return { ok: false, error: DENIED };
  const on = isoDate(receivedOn);
  if (!on) return { ok: false, error: "กรุณากรอกวันที่รับให้ครบ" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_transfer", { p_id: id, p_received_on: on });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "รับวัสดุเข้าคลังแล้ว" };
}

export async function cancelTransfer(id: string, reason: string): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditInventory || !isUuid(id)) return { ok: false, error: DENIED };
  const r = text(reason, 500);
  if (r.length < 3) return { ok: false, error: "กรุณาระบุเหตุผลที่ยกเลิก (อย่างน้อย 3 ตัวอักษร)" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_transfer", { p_id: id, p_reason: r });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "ยกเลิกใบโอนแล้ว วัสดุกลับเข้าคลังต้นทาง" };
}

// ---------- ตั้งค่า: หมวด (ผู้ดูแลระบบ) วัสดุ คลัง ----------
export async function saveCategory(input: { id: string | null; name: string; sortOrder: string; isActive: boolean }): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.isAdmin) return { ok: false, error: "หมวดวัสดุแก้ไขได้เฉพาะผู้ดูแลระบบ" };
  const name = text(input.name, 100).replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "กรุณากรอกชื่อหมวด" };
  const sort = Number.parseInt(text(input.sortOrder, 6) || "0", 10);
  const row = { name, sort_order: Number.isFinite(sort) ? sort : 0, is_active: input.isActive };
  const supabase = await createClient();
  const { error } = input.id && isUuid(input.id)
    ? await supabase.from("inventory_categories").update(row).eq("id", input.id)
    : await supabase.from("inventory_categories").insert(row);
  if (error) return { ok: false, error: error.code === "23505" ? "มีหมวดชื่อนี้อยู่แล้ว" : explainError(error) };
  refresh();
  return { ok: true, message: `บันทึกหมวด ${name} แล้ว` };
}

export async function saveItem(input: {
  id: string | null;
  code: string;
  name: string;
  categoryId: string;
  unit: string;
  reorderPoint: string;
  note: string;
  isActive: boolean;
}): Promise<ActionResult & { id?: string }> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditInventory) return { ok: false, error: "ท่านไม่มีสิทธิ์แก้ไขทะเบียนวัสดุ" };
  const code = text(input.code, 40);
  const name = text(input.name, 200);
  const unit = text(input.unit, 30);
  if (!code || !name || !unit) return { ok: false, error: "กรุณากรอกรหัส ชื่อ และหน่วยนับ" };
  const reorder = parseQty(text(input.reorderPoint, 20) || "0");
  if (reorder === null) return { ok: false, error: "จุดสั่งซื้อต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง" };
  const row = {
    code,
    name,
    unit,
    category_id: isUuid(input.categoryId) ? input.categoryId : null,
    reorder_point: reorder,
    note: text(input.note, 500),
    is_active: input.isActive,
  };
  const supabase = await createClient();
  const res = input.id && isUuid(input.id)
    ? await supabase.from("items").update(row).eq("id", input.id).select("id").maybeSingle()
    : await supabase.from("items").insert(row).select("id").maybeSingle();
  if (res.error) return { ok: false, error: res.error.code === "23505" ? "รหัสวัสดุนี้มีอยู่แล้ว" : explainError(res.error) };
  if (!res.data) return { ok: false, error: "ท่านไม่มีสิทธิ์แก้ไขทะเบียนวัสดุ" };
  refresh();
  return { ok: true, message: `บันทึกวัสดุ ${code} ${name} แล้ว`, id: (res.data as { id: string }).id };
}

export async function saveWarehouse(input: {
  id: string | null;
  orgUnitId: string;
  kind: string;
  parentId: string;
  code: string;
  name: string;
  note: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditInventory) return { ok: false, error: DENIED };
  const code = text(input.code, 40);
  const name = text(input.name, 200);
  if (!code || !name) return { ok: false, error: "กรุณากรอกรหัสและชื่อคลัง" };
  const supabase = await createClient();
  if (input.id && isUuid(input.id)) {
    const { data, error } = await supabase
      .from("warehouses")
      .update({ code, name, note: text(input.note, 500), is_active: input.isActive })
      .eq("id", input.id)
      .select("id");
    if (error) return { ok: false, error: error.code === "23505" ? "รหัสคลังนี้มีอยู่แล้ว" : explainError(error) };
    if (!data?.length) return { ok: false, error: DENIED };
  } else {
    if (!isUuid(input.orgUnitId)) return { ok: false, error: "กรุณาเลือกหน่วยเจ้าของคลัง" };
    if (input.kind !== "main" && input.kind !== "sub") return { ok: false, error: "กรุณาเลือกประเภทคลัง" };
    if (input.kind === "sub" && !isUuid(input.parentId)) return { ok: false, error: "คลังย่อยต้องเลือกคลังกลางที่สังกัด" };
    const { error } = await supabase.from("warehouses").insert({
      org_unit_id: input.orgUnitId,
      kind: input.kind,
      parent_id: input.kind === "sub" ? input.parentId : null,
      code,
      name,
      note: text(input.note, 500),
    });
    if (error) return { ok: false, error: error.code === "23505" ? "รหัสคลังนี้มีอยู่แล้ว" : explainError(error) };
  }
  refresh();
  return { ok: true, message: `บันทึกคลัง ${name} แล้ว` };
}
