"use server";

import { explainError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function sendTestNotification(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_test_notification");
  if (error) return { ok: false, error: explainError(error) };
  return { ok: true, message: "ส่งแจ้งเตือนทดสอบแล้ว ดูที่กระดิ่งบนแถบบน (อาจใช้เวลาไม่เกิน 1 นาที หรือกดที่กระดิ่ง)" };
}
