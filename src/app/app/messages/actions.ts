"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/auth/guards";
import { isUuid } from "@/lib/budget";
import { explainError } from "@/lib/errors";
import { CONTACT_STATUS, type ContactStatus } from "@/lib/site-content";
import { createClient } from "@/lib/supabase/server";

/** เปลี่ยนสถานะข้อความติดต่อ (ผู้รับของหัวข้อและผู้ดูแลระบบ ฐานข้อมูลตรวจซ้ำ) */
export async function setMessageStatus(id: string, status: string, note: string) {
  await requireWorkspace();
  if (!isUuid(id)) return { ok: false, error: "ไม่พบข้อความ" };
  if (!(CONTACT_STATUS as readonly string[]).includes(status)) return { ok: false, error: "สถานะไม่ถูกต้อง" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_contact_message_status", {
    p_id: id,
    p_status: status as ContactStatus,
    p_note: String(note ?? "").trim().slice(0, 2000),
  });
  if (error) return { ok: false, error: explainError(error) };
  revalidatePath("/app/messages", "layout");
  revalidatePath("/app");
  return { ok: true, message: "บันทึกแล้ว" };
}
