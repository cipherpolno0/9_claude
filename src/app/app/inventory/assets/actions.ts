"use server";

import { revalidatePath } from "next/cache";

import { requireMenu } from "@/lib/auth/guards";
import { isUuid, parseMoney } from "@/lib/budget";
import { explainError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** ครุภัณฑ์: ทะเบียนเขียนผ่าน RLS + trigger assets_rules ส่วนประวัติ ตรวจนับ และจำหน่าย เรียกฟังก์ชันฐานข้อมูลที่ตรวจสิทธิ์ซ้ำ */

const MENU = "/app/inventory";
const DENIED = "ท่านไม่มีสิทธิ์ทำรายการครุภัณฑ์ของหน่วยนี้";
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function refresh() {
  revalidatePath(MENU, "layout");
  revalidatePath("/app/approvals", "layout");
}

async function rpc(fn: string, args: Record<string, unknown>, message: string): Promise<ActionResult & { id?: string; data?: unknown }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: explainError(error) };
  refresh();
  return { ok: true, message, id: typeof data === "string" ? data : undefined, data };
}

export type AssetInput = {
  id: string | null;
  assetNo: string;
  name: string;
  typeId: string;
  brand: string;
  model: string;
  serialNo: string;
  acquiredOn: string;
  method: string;
  price: string;
  sourceId: string;
  lifeYears: string;
  orgUnitId: string;
  location: string;
  custodian: string;
  condition: string;
  note: string;
};

export async function saveAsset(input: AssetInput): Promise<ActionResult & { id?: string }> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditInventory) return { ok: false, error: DENIED };
  const assetNo = text(input.assetNo, 60);
  const name = text(input.name, 200);
  if (!assetNo || !name) return { ok: false, error: "กรุณากรอกเลขครุภัณฑ์และชื่อ" };
  if (!isUuid(input.typeId)) return { ok: false, error: "กรุณาเลือกประเภทครุภัณฑ์" };
  const acquiredOn = isoDate(input.acquiredOn);
  if (!acquiredOn) return { ok: false, error: "กรุณากรอกวันที่ได้มาให้ครบ" };
  if (!["purchase", "donation", "transfer"].includes(input.method)) return { ok: false, error: "กรุณาเลือกวิธีได้มา" };
  const price = parseMoney(text(input.price, 20));
  if (price === null) return { ok: false, error: "ราคาต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง (บริจาคที่ไม่ทราบราคาใส่ 0)" };
  const lifeText = text(input.lifeYears, 3);
  const life = lifeText === "" ? null : Number(lifeText);
  if (life !== null && (!Number.isInteger(life) || life < 1 || life > 100)) return { ok: false, error: "อายุการใช้งานต้องเป็นจำนวนปี 1 ถึง 100 (เว้นว่าง = ตามประเภท)" };
  if (!["usable", "damaged"].includes(input.condition)) return { ok: false, error: "กรุณาเลือกสภาพ" };
  const row = {
    asset_no: assetNo,
    name,
    type_id: input.typeId,
    brand: text(input.brand, 100),
    model: text(input.model, 100),
    serial_no: text(input.serialNo, 100),
    acquired_on: acquiredOn,
    acquire_method: input.method,
    price,
    source_id: isUuid(input.sourceId) ? input.sourceId : null,
    useful_life_years: life,
    location: text(input.location, 200),
    custodian: text(input.custodian, 200),
    condition: input.condition,
    note: text(input.note, 500),
  };
  const supabase = await createClient();
  const res =
    input.id && isUuid(input.id)
      ? await supabase.from("assets").update(row).eq("id", input.id).select("id").maybeSingle()
      : isUuid(input.orgUnitId)
        ? await supabase.from("assets").insert({ ...row, org_unit_id: input.orgUnitId }).select("id").maybeSingle()
        : null;
  if (!res) return { ok: false, error: "กรุณาเลือกหน่วยที่ครอบครอง" };
  if (res.error) return { ok: false, error: res.error.code === "23505" ? "เลขครุภัณฑ์นี้มีอยู่แล้ว" : explainError(res.error) };
  if (!res.data) return { ok: false, error: DENIED };
  refresh();
  return { ok: true, message: `บันทึกครุภัณฑ์ ${assetNo} แล้ว`, id: (res.data as { id: string }).id };
}

/** ปิดใช้งาน (บันทึกผิด) หรือเปิดใช้งานคืน */
export async function setAssetActive(id: string, active: boolean): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditInventory || !isUuid(id)) return { ok: false, error: DENIED };
  const supabase = await createClient();
  const { data, error } = await supabase.from("assets").update({ is_active: active }).eq("id", id).select("id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  refresh();
  return { ok: true, message: active ? "เปิดใช้งานแล้ว" : "ปิดใช้งานแล้ว (ไม่นับในทะเบียนและรายงาน)" };
}

export async function sendAssetTransfer(asset: string, toUnit: string, sentOn: string, note: string) {
  await requireMenu(MENU);
  if (!isUuid(asset)) return { ok: false as const, error: DENIED };
  if (!isUuid(toUnit)) return { ok: false as const, error: "กรุณาเลือกหน่วยปลายทาง" };
  const on = isoDate(sentOn);
  if (!on) return { ok: false as const, error: "กรุณากรอกวันที่โอนให้ครบ" };
  return rpc("send_asset_transfer", { p_asset: asset, p_to_unit: toUnit, p_sent_on: on, p_note: text(note, 500) }, "บันทึกโอนแล้ว รอหน่วยปลายทางกดรับ");
}

export async function receiveAssetTransfer(id: string, receivedOn: string, location: string, custodian: string) {
  await requireMenu(MENU);
  const on = isoDate(receivedOn);
  if (!isUuid(id) || !on) return { ok: false as const, error: "กรุณากรอกวันที่รับให้ครบ" };
  return rpc("receive_asset_transfer", { p_id: id, p_received_on: on, p_location: text(location, 200), p_custodian: text(custodian, 200) },
    "รับครุภัณฑ์เข้าหน่วยแล้ว");
}

export async function cancelAssetTransfer(id: string, reason: string) {
  await requireMenu(MENU);
  if (!isUuid(id)) return { ok: false as const, error: DENIED };
  return rpc("cancel_asset_transfer", { p_id: id, p_reason: text(reason, 500) }, "ยกเลิกการโอนแล้ว");
}

export async function lendAsset(asset: string, borrower: string, loanedOn: string, dueOn: string, note: string) {
  await requireMenu(MENU);
  const on = isoDate(loanedOn);
  if (!isUuid(asset) || !on) return { ok: false as const, error: "กรุณากรอกวันที่ยืมให้ครบ" };
  return rpc("lend_asset", { p_asset: asset, p_borrower: text(borrower, 200), p_loaned_on: on, p_due_on: isoDate(dueOn), p_note: text(note, 500) },
    "บันทึกการยืมแล้ว");
}

export async function returnAsset(loan: string, returnedOn: string, note: string) {
  await requireMenu(MENU);
  const on = isoDate(returnedOn);
  if (!isUuid(loan) || !on) return { ok: false as const, error: "กรุณากรอกวันที่คืนให้ครบ" };
  return rpc("return_asset", { p_loan: loan, p_returned_on: on, p_note: text(note, 500) }, "บันทึกการคืนแล้ว");
}

export async function addRepair(asset: string, repairedOn: string, description: string, cost: string, vendor: string) {
  await requireMenu(MENU);
  const on = isoDate(repairedOn);
  if (!isUuid(asset) || !on) return { ok: false as const, error: "กรุณากรอกวันที่ซ่อมให้ครบ" };
  const c = parseMoney(text(cost, 20) || "0");
  if (c === null) return { ok: false as const, error: "ค่าใช้จ่ายต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง" };
  return rpc("add_asset_repair", { p_asset: asset, p_repaired_on: on, p_description: text(description, 500), p_cost: c, p_vendor: text(vendor, 200) },
    "บันทึกการซ่อมบำรุงแล้ว");
}

export async function cancelRepair(id: string, reason: string) {
  await requireMenu(MENU);
  if (!isUuid(id)) return { ok: false as const, error: DENIED };
  return rpc("cancel_asset_repair", { p_id: id, p_reason: text(reason, 500) }, "ยกเลิกรายการซ่อมแล้ว");
}

export async function createCount(unit: string, title: string, includeSub: boolean, startedOn: string, note: string) {
  await requireMenu(MENU);
  const on = isoDate(startedOn);
  if (!isUuid(unit)) return { ok: false as const, error: "กรุณาเลือกหน่วย" };
  if (!on) return { ok: false as const, error: "กรุณากรอกวันที่เริ่มให้ครบ" };
  return rpc("create_asset_count", { p_unit: unit, p_title: text(title, 200), p_include_sub: includeSub, p_started_on: on, p_note: text(note, 500) },
    "เปิดรอบตรวจนับแล้ว");
}

export async function recordCount(count: string, asset: string, result: "found" | "damaged", note = "") {
  await requireMenu(MENU);
  if (!isUuid(count) || !isUuid(asset)) return { ok: false as const, error: DENIED };
  return rpc("record_asset_count", { p_count: count, p_asset: asset, p_result: result, p_note: text(note, 500) },
    result === "found" ? "บันทึกผล พบ แล้ว" : "บันทึกผล ชำรุด แล้ว");
}

export async function closeCount(count: string) {
  await requireMenu(MENU);
  if (!isUuid(count)) return { ok: false as const, error: DENIED };
  return rpc("close_asset_count", { p_count: count }, "ปิดรอบตรวจนับแล้ว รายการที่ยังไม่ตรวจบันทึกเป็น ไม่พบ");
}

export async function submitDisposal(asset: string, reason: string) {
  await requireMenu(MENU);
  if (!isUuid(asset)) return { ok: false as const, error: DENIED };
  return rpc("submit_asset_disposal", { p_asset: asset, p_reason: text(reason, 1000) }, "ยื่นคำขอจำหน่ายแล้ว แนบรูปได้ที่หน้าคำขอ");
}

export async function resubmitDisposal(request: string, reason: string) {
  await requireMenu(MENU);
  if (!isUuid(request)) return { ok: false as const, error: DENIED };
  return rpc("resubmit_asset_disposal", { p_request: request, p_reason: text(reason, 1000) }, "ส่งคำขอจำหน่ายอีกครั้งแล้ว");
}

/** ประเภทครุภัณฑ์และอายุการใช้งาน (ผู้ดูแลระบบ) */
export async function saveAssetType(input: { id: string | null; name: string; life: string; sortOrder: string; isActive: boolean }): Promise<ActionResult> {
  const ctx = await requireMenu(MENU);
  if (!ctx.isAdmin) return { ok: false, error: "ประเภทครุภัณฑ์แก้ไขได้เฉพาะผู้ดูแลระบบ" };
  const name = text(input.name, 100).replace(/\s+/g, " ");
  const life = Number(text(input.life, 3));
  if (!name) return { ok: false, error: "กรุณากรอกชื่อประเภท" };
  if (!Number.isInteger(life) || life < 1 || life > 100) return { ok: false, error: "อายุการใช้งานต้องเป็นจำนวนปี 1 ถึง 100" };
  const sort = Number.parseInt(text(input.sortOrder, 6) || "0", 10);
  const row = { name, useful_life_years: life, sort_order: Number.isFinite(sort) ? sort : 0, is_active: input.isActive };
  const supabase = await createClient();
  const { error } =
    input.id && isUuid(input.id)
      ? await supabase.from("asset_types").update(row).eq("id", input.id)
      : await supabase.from("asset_types").insert(row);
  if (error) return { ok: false, error: error.code === "23505" ? "มีประเภทชื่อนี้อยู่แล้ว" : explainError(error) };
  refresh();
  return { ok: true, message: `บันทึกประเภท ${name} แล้ว` };
}
