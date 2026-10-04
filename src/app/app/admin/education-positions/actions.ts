"use server";

import { revalidatePath } from "next/cache";

import { isTrack } from "@/lib/education";
import { explainError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const PAGE = "/app/admin/education-positions";
const UUID = /^[0-9a-f-]{36}$/i;

/** RLS ยอมให้เพิ่มและแก้ไขเฉพาะผู้ดูแลระบบ */
export async function addEducationPositionType(track: string, name: string, sortOrder: number): Promise<ActionResult> {
  const clean = name.trim();
  if (!isTrack(track)) return { ok: false, error: "ไม่รู้จักแท่งนี้" };
  if (!clean) return { ok: false, error: "กรุณากรอกชื่อประเภทตำแหน่ง" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("education_position_types")
    .insert({ track, name: clean, sort_order: Number.isInteger(sortOrder) ? sortOrder : 0 });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "มีประเภทตำแหน่งชื่อนี้ในแท่งนี้แล้ว" };
    return { ok: false, error: explainError(error) };
  }
  revalidatePath(PAGE);
  return { ok: true, message: `เพิ่ม "${clean}" แล้ว` };
}

export async function updateEducationPositionType(
  id: string,
  changes: { name?: string; sortOrder?: number; isActive?: boolean },
): Promise<ActionResult> {
  if (!UUID.test(id)) return { ok: false, error: "ไม่พบรายการนี้" };
  const row: Record<string, string | number | boolean> = {};
  if (changes.name !== undefined) {
    if (!changes.name.trim()) return { ok: false, error: "กรุณากรอกชื่อประเภทตำแหน่ง" };
    row.name = changes.name.trim();
  }
  if (changes.sortOrder !== undefined && Number.isInteger(changes.sortOrder)) row.sort_order = changes.sortOrder;
  if (changes.isActive !== undefined) row.is_active = changes.isActive;

  const supabase = await createClient();
  const { data, error } = await supabase.from("education_position_types").update(row).eq("id", id).select("id");
  if (error) {
    if (error.code === "23505") return { ok: false, error: "มีประเภทตำแหน่งชื่อนี้ในแท่งนี้แล้ว" };
    return { ok: false, error: explainError(error) };
  }
  if (!data?.length) return { ok: false, error: "ท่านไม่มีสิทธิ์ทำรายการนี้" };
  revalidatePath(PAGE);
  return { ok: true, message: "บันทึกแล้ว" };
}
