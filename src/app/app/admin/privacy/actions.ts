"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import { explainError } from "@/lib/errors";
import { PRIVACY_TAG } from "@/lib/privacy";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean; message?: string; error?: string };
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** แก้หัวข้อและเนื้อความของนโยบายหรือข้อความแจ้ง (ผู้ดูแลระบบ) */
export async function savePrivacyText(key: string, formData: FormData): Promise<Result> {
  try {
    await requireAdmin();
    const title = text(formData.get("title"), 200);
    const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 20000);
    if (!title) return { ok: false, error: "กรุณากรอกหัวข้อ" };
    const supabase = await createClient();
    const { data, error } = await supabase.from("privacy_texts").update({ title, body }).eq("key", key).select("key");
    if (error) return { ok: false, error: explainError(error) };
    if (!data?.length) return { ok: false, error: "ไม่พบหัวข้อนี้ หรือท่านไม่มีสิทธิ์แก้" };
    revalidateTag(PRIVACY_TAG, { expire: 0 });
    revalidatePath("/privacy");
    revalidatePath("/app/admin/privacy");
    return { ok: true, message: "บันทึกแล้ว" };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}

/** ตั้งอายุการเก็บ (ปี ว่าง = ไม่กำหนด) */
export async function saveRetentionRule(key: string, formData: FormData): Promise<Result> {
  try {
    await requireAdmin();
    const raw = text(formData.get("years"), 4);
    const years = raw === "" ? null : Number(raw);
    if (years !== null && (!Number.isInteger(years) || years < 1 || years > 100)) {
      return { ok: false, error: "จำนวนปีต้องเป็นจำนวนเต็ม 1 ถึง 100 หรือเว้นว่าง" };
    }
    const note = text(formData.get("note"), 500);
    const supabase = await createClient();
    const { data, error } = await supabase.from("data_retention_rules").update({ years, note }).eq("data_key", key).select("data_key");
    if (error) return { ok: false, error: explainError(error) };
    if (!data?.length) return { ok: false, error: "ไม่พบชนิดข้อมูลนี้ หรือท่านไม่มีสิทธิ์แก้" };
    revalidatePath("/app/admin/privacy");
    return { ok: true, message: "บันทึกแล้ว" };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}
