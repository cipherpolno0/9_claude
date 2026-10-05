"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import type { FormState } from "@/components/form";
import { explainError, type ActionResult } from "@/lib/errors";
import { REGISTRY_TAG } from "@/lib/registry";
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

// ------------------------------------------------------------------
// ปีการศึกษา (ใช้กับทะเบียนสนามสอบและระบบสอบ) เพิ่มและตั้งปีปัจจุบันได้เฉพาะผู้ดูแลระบบ
// ------------------------------------------------------------------

export async function addAcademicYear(_prev: FormState, formData: FormData): Promise<FormState> {
  const year = Number(String(formData.get("year_be") ?? "").trim());
  const startsOn = String(formData.get("starts_on") ?? "");
  const endsOn = String(formData.get("ends_on") ?? "");
  if (!Number.isInteger(year) || year < 2400 || year > 2700) return { error: "กรุณากรอกปีการศึกษาเป็น พ.ศ. 4 หลัก" };
  if (formData.get("starts_on_incomplete") || formData.get("ends_on_incomplete") || !startsOn || !endsOn) {
    return { error: "กรุณากรอกวันเริ่มและวันสิ้นสุดให้ครบ" };
  }
  if (endsOn <= startsOn) return { error: "วันสิ้นสุดต้องอยู่หลังวันเริ่ม" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .insert({ year_be: year, starts_on: startsOn, ends_on: endsOn })
    .select("id");
  if (error) return { error: error.code === "23505" ? `มีปีการศึกษา ${year} อยู่แล้ว` : explainError(error) };
  if (!data?.length) return { error: "ท่านไม่มีสิทธิ์ทำรายการนี้" };
  revalidatePath("/", "layout");
  return { message: `เพิ่มปีการศึกษา ${year} แล้ว` };
}

export async function setCurrentAcademicYear(yearId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_current_academic_year", { p_year_id: yearId });
  if (error) return { ok: false, error: explainError(error) };
  revalidatePath("/", "layout");
  revalidateTag(REGISTRY_TAG, { expire: 0 }); // หน้าสนามสอบสาธารณะแสดงรายชื่อของปีปัจจุบัน
  return { ok: true, message: "ตั้งปีการศึกษาปัจจุบันแล้ว" };
}
