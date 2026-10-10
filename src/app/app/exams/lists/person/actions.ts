"use server";

import { requireMenu } from "@/lib/auth/guards";
import { looksLikeId, type PersonRow } from "@/lib/exam-lists";
import { searchPeople } from "@/lib/exam-lists-server";

/** ตรวจสอบรายบุคคล: ค้นด้วยเลขประจำตัว (ถ้าคำค้นเป็นเลข) หรือชื่อ ฉายา นามสกุล (ใช้ Server Action เพื่อไม่ให้เลขประจำตัวอยู่ในที่อยู่หน้าเว็บ) */
export async function searchPersonAction(query: string): Promise<{ ok: true; rows: PersonRow[] } | { ok: false; error: string }> {
  await requireMenu("/app/exams");
  const q = (typeof query === "string" ? query : "").trim().slice(0, 120);
  if (!q) return { ok: false, error: "กรุณาพิมพ์ชื่อ ฉายา นามสกุล หรือเลขประจำตัว" };
  return looksLikeId(q) ? searchPeople("", q) : searchPeople(q, "");
}
