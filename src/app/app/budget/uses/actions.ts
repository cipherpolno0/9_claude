"use server";

import { revalidatePath } from "next/cache";

import { requireMenu } from "@/lib/auth/guards";
import { isUuid, parseMoney } from "@/lib/budget";
import { explainError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** คำขอใช้งบ เบิกจ่าย รายการปรับปรุง และคืนเงินเหลือจ่าย (กติกาทั้งหมดตรวจซ้ำในฐานข้อมูล) */

const MENU = "/app/budget";
const DENIED = "ท่านไม่มีสิทธิ์บันทึกงบประมาณของหน่วยนี้";
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function refresh() {
  revalidatePath(MENU, "layout");
  revalidatePath("/app/approvals", "layout");
}

export type UseLineInput = { description: string; quantity: string; unit: string; unit_price: string };

/** ตรวจรูปแบบบรรทัดค่าใช้จ่ายก่อนส่ง (จำนวนและราคาเป็นข้อความตัวเลข ให้ฐานข้อมูลคำนวณยอดเอง) */
function cleanLines(lines: UseLineInput[]): { ok: true; lines: UseLineInput[] } | { ok: false; error: string } {
  const rows = (Array.isArray(lines) ? lines : []).filter(
    (l) => text(l?.description, 200) || text(l?.quantity, 20) || text(l?.unit_price, 20),
  );
  if (rows.length === 0) return { ok: false, error: "กรุณากรอกรายละเอียดค่าใช้จ่ายอย่างน้อย 1 รายการ" };
  if (rows.length > 50) return { ok: false, error: "รายละเอียดค่าใช้จ่ายได้ไม่เกิน 50 รายการ" };
  const out: UseLineInput[] = [];
  for (const [i, l] of rows.entries()) {
    const description = text(l.description, 200).replace(/\s+/g, " ");
    const quantity = parseMoney(text(l.quantity, 20));
    const price = parseMoney(text(l.unit_price, 20));
    if (!description) return { ok: false, error: `รายการที่ ${i + 1}: กรุณากรอกรายการค่าใช้จ่าย` };
    if (quantity === null || Number(quantity) <= 0) return { ok: false, error: `รายการที่ ${i + 1}: จำนวนต้องมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง` };
    if (price === null) return { ok: false, error: `รายการที่ ${i + 1}: ราคาต่อหน่วยต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง` };
    out.push({ description, quantity, unit: text(l.unit, 30), unit_price: price });
  }
  return { ok: true, lines: out };
}

export async function submitUse(input: { item: string; unit: string; purpose: string; lines: UseLineInput[] }): Promise<ActionResult & { id?: string }> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget || !isUuid(input.unit)) return { ok: false, error: DENIED };
  if (!isUuid(input.item)) return { ok: false, error: "กรุณาเลือกรายการงบประมาณ" };
  const lines = cleanLines(input.lines);
  if (!lines.ok) return lines;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_budget_use", {
    p_item: input.item,
    p_unit: input.unit,
    p_purpose: text(input.purpose, 1000),
    p_lines: lines.lines,
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "ยื่นคำขอใช้งบแล้ว แนบเอกสารประกอบได้ที่หน้าคำขอ", id: data as string };
}

export async function resubmitUse(id: string, purpose: string, lines: UseLineInput[]): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget || !isUuid(id)) return { ok: false, error: DENIED };
  const clean = cleanLines(lines);
  if (!clean.ok) return clean;
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_budget_use", { p_id: id, p_purpose: text(purpose, 1000), p_lines: clean.lines });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "ส่งคำขอใช้งบอีกครั้งแล้ว" };
}

export type DisbursementInput = {
  use: string;
  paidOn: string;
  payee: string;
  amount: string;
  voucher: string;
  note: string;
  assetRef: string;
};

export async function recordDisbursement(input: DisbursementInput): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget || !isUuid(input.use)) return { ok: false, error: DENIED };
  const paidOn = isoDate(input.paidOn);
  if (!paidOn) return { ok: false, error: "กรุณากรอกวันที่จ่าย" };
  const amount = parseMoney(input.amount);
  if (amount === null || Number(amount) <= 0) return { ok: false, error: "จำนวนเงินต้องมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง" };
  const assetRef = text(input.assetRef, 40);
  if (assetRef && !isUuid(assetRef)) return { ok: false, error: "รหัสรายการรับเข้าพัสดุไม่ถูกต้อง (เว้นว่างได้)" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_disbursement", {
    p_use: input.use,
    p_paid_on: paidOn,
    p_payee: text(input.payee, 200),
    p_amount: amount,
    p_voucher: text(input.voucher, 60),
    p_note: text(input.note, 500),
    p_asset_ref: assetRef || null,
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "บันทึกการเบิกจ่ายแล้ว แนบใบเสร็จได้ที่แถวของงวดนี้" };
}

export async function adjustDisbursement(id: string, amountText: string, decrease: boolean, reason: string, paidOn: string): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget || !isUuid(id)) return { ok: false, error: DENIED };
  const amount = parseMoney(amountText);
  if (amount === null || Number(amount) === 0) return { ok: false, error: "จำนวนเงินที่ปรับปรุงต้องมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_disbursement", {
    p_id: id,
    p_amount: decrease ? `-${amount}` : amount,
    p_reason: text(reason, 1000),
    p_paid_on: isoDate(paidOn),
  });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message: "บันทึกรายการปรับปรุงแล้ว" };
}

export async function closeUse(id: string, reason: string): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditBudget || !isUuid(id)) return { ok: false, error: DENIED };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_budget_use", { p_use: id, p_reason: text(reason, 1000) });
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  const released = Number(data ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return { ok: true, message: `ปิดคำขอแล้ว คืนเงินเหลือจ่าย ${released} บาท กลับเข้ารายการ` };
}
