"use server";

import { explainError } from "@/lib/errors";
import { CONTACT_MIN_FILL_MS, isContactTopic } from "@/lib/site-content";
import { contactClientHash } from "@/lib/site-content-server";
import { createAdminClient, getSupabaseEnv } from "@/lib/supabase/admin";

export type ContactResult = { ok: boolean; message?: string; error?: string };

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/**
 * ส่งข้อความจากแบบฟอร์มติดต่อเรา เหตุผลที่ใช้ createAdminClient (กุญแจลับ):
 * ฟังก์ชัน submit_contact_message นับจำนวนครั้งต่อชั่วโมงต่อเครื่องในฐานข้อมูล ถ้าเปิดให้ anon เรียกตรง
 * ผู้เรียก API โดยตรงจะส่งรหัสเครื่องปลอมเลี่ยงการจำกัดได้ จึงให้เฉพาะเซิร์ฟเวอร์ของเว็บเรียก (service_role)
 * กันสแปม 4 ชั้น: ช่องดักบอท (ซ่อนจากคน) / เวลากรอกขั้นต่ำ / จำกัด 5 ครั้งต่อชั่วโมงต่อเครื่อง / ตรวจรูปแบบและความยาวในฐานข้อมูล
 */
export async function sendContactMessage(formData: FormData): Promise<ContactResult> {
  const thanks = "ส่งข้อความแล้ว เจ้าหน้าที่จะติดต่อกลับทางอีเมลหรือโทรศัพท์ที่ให้ไว้";
  // บอทมักกรอกทุกช่องและส่งทันที: ตอบเหมือนสำเร็จแต่ไม่บันทึก
  if (text(formData.get("website"), 200) !== "") return { ok: true, message: thanks };
  const started = Number(formData.get("started_at") ?? 0);
  if (!Number.isFinite(started) || Date.now() - started < CONTACT_MIN_FILL_MS) return { ok: true, message: thanks };

  const topic = String(formData.get("topic") ?? "");
  if (!isContactTopic(topic)) return { ok: false, error: "กรุณาเลือกหัวข้อ" };
  const name = text(formData.get("name"), 200);
  const email = text(formData.get("email"), 200);
  const phone = text(formData.get("phone"), 50);
  const subject = text(formData.get("subject"), 300);
  const message = text(formData.get("message"), 5000);
  if (!name) return { ok: false, error: "กรุณากรอกชื่อ" };
  if (!email && !phone) return { ok: false, error: "กรุณากรอกอีเมลหรือเบอร์โทรศัพท์อย่างน้อย 1 ช่อง เพื่อให้เจ้าหน้าที่ติดต่อกลับ" };
  if (!subject) return { ok: false, error: "กรุณากรอกเรื่อง" };
  if (message.length < 10) return { ok: false, error: "ข้อความต้องยาวอย่างน้อย 10 ตัวอักษร" };

  const { secretKey, missing } = getSupabaseEnv();
  if (missing.length) return { ok: false, error: "ระบบส่งข้อความยังไม่พร้อมใช้งาน" };
  try {
    const { data, error } = await createAdminClient().rpc("submit_contact_message", {
      p_topic: topic,
      p_name: name,
      p_email: email,
      p_phone: phone,
      p_subject: subject,
      p_message: message,
      p_client: await contactClientHash(secretKey),
    });
    if (error) return { ok: false, error: explainError(error) };
    const v = (data ?? {}) as { ok?: boolean; limited?: boolean };
    if (v.limited) return { ok: false, error: "ส่งข้อความบ่อยเกินไป (เกิน 5 ครั้งต่อชั่วโมง) กรุณารอสักครู่แล้วส่งใหม่ หรือโทรติดต่อ" };
    return { ok: true, message: thanks };
  } catch (error) {
    return { ok: false, error: explainError(error) };
  }
}
