"use server";

import { revalidatePath } from "next/cache";

import { explainError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/app/admin/settings";

/** RLS ยอมให้แก้เฉพาะผู้ดูแลระบบ ถ้าไม่มีสิทธิ์จะไม่มีแถวใดถูกแก้ */
export async function setRoleMfa(key: string, required: boolean): Promise<ActionResult> {
  if (key === "admin" && !required) {
    return { ok: false, error: "บทบาทผู้ดูแลระบบต้องยืนยันตัวตน 2 ขั้นเสมอ" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("roles").update({ mfa_required: required }).eq("key", key).select("key");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์ทำรายการนี้" };
  revalidatePath(PAGE);
  return { ok: true, message: "บันทึกแล้ว" };
}

export async function updateSetting(key: string, value: number): Promise<ActionResult> {
  if (!Number.isInteger(value) || value < 1 || value > 3650) {
    return { ok: false, error: "กรุณากรอกจำนวนวันเป็นเลขจำนวนเต็ม 1 ถึง 3650" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_settings").update({ value_int: value }).eq("key", key).select("key");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์ทำรายการนี้" };
  revalidatePath("/", "layout");
  return { ok: true, message: "บันทึกแล้ว" };
}

/** จำนวนสูงสุดของตำแหน่งต่อหน่วยในเวลาเดียวกัน (null = ไม่จำกัด) เจ้าคณะมีได้ 1 รูปเสมอ */
export async function setPositionLimit(key: string, limit: number | null): Promise<ActionResult> {
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 99)) {
    return { ok: false, error: "กรุณากรอกจำนวนเป็นเลขจำนวนเต็ม 1 ถึง 99 หรือเว้นว่างถ้าไม่จำกัด" };
  }
  if (key.startsWith("chief_") && limit !== 1) {
    return { ok: false, error: "ตำแหน่งเจ้าคณะมีได้ 1 รูปต่อหน่วยเสมอ" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("position_types")
    .update({ max_per_unit: limit })
    .eq("key", key)
    .select("key");
  if (error) return { ok: false, error: explainError(error) };
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์ทำรายการนี้" };
  revalidatePath(PAGE);
  return { ok: true, message: "บันทึกแล้ว" };
}
