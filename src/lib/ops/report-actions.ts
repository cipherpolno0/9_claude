"use server";

import { headers } from "next/headers";

import { getAuthContext } from "@/lib/auth/session";
import { logAppError } from "@/lib/ops/log-error";
import { rateHit } from "@/lib/security/rate-limit";

/**
 * หน้าแสดงข้อผิดพลาด (error.tsx) เรียกเมื่อเกิดข้อผิดพลาดฝั่งเบราว์เซอร์ (ไม่มี digest)
 * ข้อผิดพลาดที่มี digest มาจากเซิร์ฟเวอร์และถูกบันทึกโดย onRequestError แล้ว จึงไม่บันทึกซ้ำ
 * จำกัด 30 ครั้งต่อนาทีต่อเครื่อง
 */
export async function reportClientError(input: { message: string; path: string; digest?: string }): Promise<void> {
  if (input.digest) return;
  if (!(await rateHit("client_error", 30, "minute"))) return;
  const ctx = await getAuthContext().catch(() => null);
  const h = await headers();
  await logAppError({
    source: "client",
    routeType: "browser",
    path: String(input.path ?? "").slice(0, 300),
    message: `${String(input.message ?? "").slice(0, 800)} | ${(h.get("user-agent") ?? "").slice(0, 150)}`,
    userId: ctx?.user.id ?? null,
  });
}
