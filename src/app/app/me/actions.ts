"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/form";
import { explainError } from "@/lib/errors";
import { PROFILE_EDIT_FIELDS } from "@/lib/persons";
import { createClient } from "@/lib/supabase/server";

/**
 * ยื่นคำขอแก้ไขประวัติของตนเองผ่านเครื่องอนุมัติกลาง (ชนิดคำขอ profile_edit)
 * ส่งค่าของทุกช่องที่แก้ได้ ฐานข้อมูลจะเก็บเฉพาะช่องที่ต่างจากค่าปัจจุบัน
 */
export async function submitProfileEdit(_prev: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("birth_date_incomplete")) return { error: "วันเกิดยังกรอกไม่ครบหรือไม่ใช่วันที่ที่มีจริง" };
  if (formData.get("ordination_date_incomplete")) return { error: "วันอุปสมบทยังกรอกไม่ครบหรือไม่ใช่วันที่ที่มีจริง" };

  const changes: Record<string, string> = {};
  for (const field of PROFILE_EDIT_FIELDS) {
    if (formData.has(field)) changes[field] = String(formData.get(field) ?? "").trim();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_profile_edit", {
    p_changes: changes,
    p_detail: String(formData.get("detail") ?? "").trim(),
  });
  if (error) return { error: explainError(error) };

  revalidatePath("/app/me");
  revalidatePath("/app/approvals");
  redirect(`/app/approvals/${data}`);
}
