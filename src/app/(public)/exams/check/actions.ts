"use server";

import type { PublicCheckResult } from "@/lib/exam-lists";
import { searchPublicRegistration } from "@/lib/exam-lists-server";

/** ตรวจรายชื่อผู้ขอเข้าสอบ (ไม่ต้องล็อกอิน) จำกัดจำนวนครั้งต่อนาทีที่ฐานข้อมูล */
export async function checkRegistration(input: { first: string; last: string; year: string }): Promise<PublicCheckResult> {
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 120) : "");
  return searchPublicRegistration({ first: str(input?.first), last: str(input?.last), year: str(input?.year) });
}
