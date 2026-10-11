"use server";

import { revalidatePath } from "next/cache";

import { requireMenu } from "@/lib/auth/guards";
import { isUuid } from "@/lib/budget";
import { isDocClass, isDocKind, isDocUrgency } from "@/lib/docs";
import { explainError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** สารบรรณ: ทุกการเขียนเรียกฟังก์ชันฐานข้อมูลที่ตรวจสิทธิ์ ชั้นความลับ และออกเลขเอง (ยกเว้นค่าตั้งหัวหนังสือที่เขียนผ่าน RLS) */

const MENU = "/app/docs";
const DENIED = "ท่านไม่มีสิทธิ์ลงทะเบียนหนังสือ";
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const uuids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => isUuid(x)))] : []);

type Result = ActionResult & { id?: string; data?: unknown };

async function rpc(fn: string, args: Record<string, unknown>, message: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: explainError(error) };
  revalidatePath(MENU, "layout");
  return { ok: true, message, id: typeof data === "string" ? data : undefined, data };
}

async function guardEdit(): Promise<string | null> {
  const ctx = await requireMenu(MENU);
  return ctx.canEditDocs ? null : DENIED;
}

function checkChoices(kind: string, urgency: string, classification: string): string | null {
  if (!isDocKind(kind)) return "กรุณาเลือกชนิดหนังสือ";
  if (!isDocUrgency(urgency)) return "กรุณาเลือกชั้นความเร็ว";
  if (!isDocClass(classification)) return "กรุณาเลือกชั้นความลับ";
  return null;
}

export type ReceiveInput = {
  kind: string;
  docNo: string;
  docDate: string;
  fromText: string;
  toText: string;
  subject: string;
  urgency: string;
  classification: string;
  note: string;
  viewers: string[];
};

function receivePayload(input: ReceiveInput): { error: string } | { payload: Record<string, unknown> } {
  const bad = checkChoices(input.kind, input.urgency, input.classification);
  if (bad) return { error: bad };
  const docDate = isoDate(input.docDate);
  if (!docDate) return { error: "กรุณากรอกวันที่ของหนังสือ (ลงวันที่) ให้ครบ" };
  const fromText = text(input.fromText, 300);
  const subject = text(input.subject, 500);
  if (!fromText) return { error: "กรุณากรอกว่าหนังสือมาจากที่ใด" };
  if (!subject) return { error: "กรุณากรอกเรื่อง" };
  return {
    payload: {
      kind: input.kind,
      doc_no: text(input.docNo, 80),
      doc_date: docDate,
      from_text: fromText,
      to_text: text(input.toText, 300),
      subject,
      urgency: input.urgency,
      classification: input.classification,
      note: text(input.note, 1000),
      viewers: input.classification === "normal" ? [] : uuids(input.viewers),
    },
  };
}

/** ลงทะเบียนหนังสือรับ (เลขทะเบียนรับออกอัตโนมัติ) */
export async function registerReceived(unitId: string, input: ReceiveInput): Promise<Result> {
  const denied = await guardEdit();
  if (denied) return { ok: false, error: denied };
  if (!isUuid(unitId)) return { ok: false, error: "กรุณาเลือกหน่วย" };
  const p = receivePayload(input);
  if ("error" in p) return { ok: false, error: p.error };
  return rpc("register_received_document", { p_unit: unitId, p: p.payload }, "ลงทะเบียนรับแล้ว");
}

export async function updateReceived(id: string, input: ReceiveInput): Promise<Result> {
  const denied = await guardEdit();
  if (denied) return { ok: false, error: denied };
  if (!isUuid(id)) return { ok: false, error: "ไม่พบหนังสือ" };
  const p = receivePayload(input);
  if ("error" in p) return { ok: false, error: p.error };
  return rpc("update_received_document", { p_id: id, p: p.payload }, "บันทึกการแก้ไขแล้ว");
}

export type DraftInput = {
  kind: string;
  toText: string;
  toUnits: string[];
  subject: string;
  urgency: string;
  classification: string;
  salutation: string;
  body: string;
  closing: string;
  signerName: string;
  signerPosition: string;
  note: string;
  viewers: string[];
};

/** บันทึกร่างหนังสือส่ง (id ว่าง = ร่างใหม่ของหน่วย unitId) แก้ได้จนกว่าจะส่ง */
export async function saveDraft(id: string | null, unitId: string | null, input: DraftInput): Promise<Result> {
  const denied = await guardEdit();
  if (denied) return { ok: false, error: denied };
  if (id !== null && !isUuid(id)) return { ok: false, error: "ไม่พบหนังสือ" };
  if (id === null && !isUuid(unitId)) return { ok: false, error: "กรุณาเลือกหน่วย" };
  const bad = checkChoices(input.kind, input.urgency, input.classification);
  if (bad) return { ok: false, error: bad };
  const subject = text(input.subject, 500);
  if (!subject) return { ok: false, error: "กรุณากรอกเรื่อง" };
  const body = String(input.body ?? "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
  if (body.length > 20000) return { ok: false, error: "เนื้อความยาวเกิน 20,000 ตัวอักษร" };
  const payload = {
    kind: input.kind,
    to_text: text(input.toText, 300),
    to_units: uuids(input.toUnits),
    subject,
    urgency: input.urgency,
    classification: input.classification,
    salutation: text(input.salutation, 100),
    body,
    closing: text(input.closing, 100),
    signer_name: text(input.signerName, 200),
    signer_position: text(input.signerPosition, 300),
    note: text(input.note, 1000),
    viewers: input.classification === "normal" ? [] : uuids(input.viewers),
  };
  return rpc("save_document_draft", { p_id: id, p_unit: id ? null : unitId, p: payload }, "บันทึกร่างแล้ว");
}

export async function issueNumber(id: string, docDate: string): Promise<Result> {
  const denied = await guardEdit();
  if (denied) return { ok: false, error: denied };
  const date = isoDate(docDate);
  if (!isUuid(id)) return { ok: false, error: "ไม่พบหนังสือ" };
  if (!date) return { ok: false, error: "กรุณากรอกวันที่ของหนังสือให้ครบ" };
  const r = await rpc("issue_document_number", { p_id: id, p_doc_date: date }, "ออกเลขแล้ว");
  return r.ok ? { ...r, message: `ออกเลขแล้ว ที่ ${String(r.data ?? "")}` } : r;
}

export async function sendDocument(id: string): Promise<Result> {
  const denied = await guardEdit();
  if (denied) return { ok: false, error: denied };
  if (!isUuid(id)) return { ok: false, error: "ไม่พบหนังสือ" };
  const r = await rpc("send_document", { p_id: id }, "บันทึกการส่งแล้ว");
  const n = Number(r.ok ? r.data : 0);
  return r.ok ? { ...r, message: n > 0 ? `บันทึกการส่งแล้ว หน่วยในระบบ ${n} หน่วยได้รับรายการรอลงรับ` : "บันทึกการส่งแล้ว" } : r;
}

export async function cancelDocument(id: string, reason: string): Promise<Result> {
  const denied = await guardEdit();
  if (denied) return { ok: false, error: denied };
  if (!isUuid(id)) return { ok: false, error: "ไม่พบหนังสือ" };
  const why = text(reason, 500);
  if (why.length < 3) return { ok: false, error: "กรุณาระบุเหตุผลที่ยกเลิก (อย่างน้อย 3 ตัวอักษร)" };
  return rpc("cancel_document", { p_id: id, p_reason: why }, "ยกเลิกแล้ว เลขนี้จะไม่ถูกนำกลับมาใช้");
}

export async function discardDraft(id: string): Promise<Result> {
  const denied = await guardEdit();
  if (denied) return { ok: false, error: denied };
  if (!isUuid(id)) return { ok: false, error: "ไม่พบหนังสือ" };
  return rpc("discard_document_draft", { p_id: id }, "ทิ้งร่างแล้ว");
}

export async function setViewers(id: string, viewers: string[]): Promise<Result> {
  const denied = await guardEdit();
  if (denied) return { ok: false, error: denied };
  if (!isUuid(id)) return { ok: false, error: "ไม่พบหนังสือ" };
  return rpc("set_document_viewers", { p_id: id, p_viewers: uuids(viewers) }, "บันทึกรายชื่อผู้เห็นหนังสือแล้ว");
}

export async function receiveDelivery(deliveryId: string, viewers: string[], note: string): Promise<Result> {
  const denied = await guardEdit();
  if (denied) return { ok: false, error: denied };
  if (!isUuid(deliveryId)) return { ok: false, error: "ไม่พบหนังสือที่รอลงรับ" };
  return rpc("receive_document_delivery", { p_delivery: deliveryId, p_viewers: uuids(viewers), p_note: text(note, 1000) }, "ลงรับแล้ว");
}

export type LetterheadInput = { codePrefix: string; agencyName: string; address: string };

/** ค่าตั้งหัวหนังสือของหน่วย (ผู้ลงทะเบียนของหน่วย หรือผู้ดูแลระบบ RLS ตรวจซ้ำ) */
export async function saveLetterhead(unitId: string, input: LetterheadInput): Promise<Result> {
  const ctx = await requireMenu(MENU);
  if (!ctx.canEditDocs && !ctx.isAdmin) return { ok: false, error: DENIED };
  if (!isUuid(unitId)) return { ok: false, error: "กรุณาเลือกหน่วย" };
  const codePrefix = text(input.codePrefix, 40).replace(/\s+/g, " ");
  if (codePrefix.includes("/")) return { ok: false, error: "รหัสหนังสือต้องไม่มีเครื่องหมาย / (ระบบเติมให้ตอนออกเลข)" };
  const row = {
    org_unit_id: unitId,
    code_prefix: codePrefix,
    agency_name: text(input.agencyName, 200),
    address: text(input.address, 500),
  };
  const supabase = await createClient();
  const { data, error } = await supabase.from("doc_unit_settings").upsert(row, { onConflict: "org_unit_id" }).select("org_unit_id");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: DENIED };
  revalidatePath(MENU, "layout");
  return { ok: true, message: "บันทึกหัวหนังสือแล้ว" };
}
