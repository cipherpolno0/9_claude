import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";

import { createAdminClient, getSupabaseEnv } from "@/lib/supabase/admin";

/**
 * ตัวจำกัดจำนวนครั้งของหน้าสาธารณะ (บทที่ 31)
 * รหัสเครื่อง = HMAC-SHA256 ของที่อยู่ IP (x-forwarded-for ตัวแรก) ด้วยกุญแจลับของเว็บ ฐานข้อมูลไม่เห็นที่อยู่จริง
 * ตัวนับอยู่ที่ private.request_hits (public_rate_hit) และ private.login_attempts เรียกได้เฉพาะ service_role
 * เหตุผลที่ใช้ createAdminClient: ถ้าให้ anon เรียกตัวนับตรง ผู้เรียก API จะส่งรหัสเครื่องปลอมเลี่ยงการจำกัดได้
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || "unknown";
}

/** รหัสทางเดียวของ (ชื่องาน + ค่าเสริม + IP) ไม่มีกุญแจลับ = null (เครื่องพัฒนาที่ยังไม่ตั้งค่า) */
export async function clientKey(prefix: string, extra = ""): Promise<string | null> {
  const { secretKey, missing } = getSupabaseEnv();
  if (missing.length) return null;
  return createHmac("sha256", secretKey).update(`${prefix}|${extra}|${await clientIp()}`).digest("hex");
}

export type RateUnit = "minute" | "hour" | "day";

/** นับหนึ่งครั้ง คืน true = ยังไม่เกิน (ถ้าตัวนับใช้ไม่ได้ ให้ผ่านเพื่อไม่ให้หน้าเว็บใช้งานไม่ได้) */
export async function rateHit(bucket: string, limit: number, unit: RateUnit): Promise<boolean> {
  const key = await clientKey(`rate-${bucket}`);
  if (!key) return true;
  try {
    const { data, error } = await createAdminClient().rpc("public_rate_hit", {
      p_bucket: bucket,
      p_client: key,
      p_limit: limit,
      p_unit: unit,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

/** จำนวนครั้งที่ค้นหาสาธารณะได้ต่อนาทีต่อเครื่อง (ทะเบียน ทำเนียบ ติดตามคำขอ) */
export const PUBLIC_SEARCH_PER_MINUTE = 60;
export const PUBLIC_SEARCH_LIMITED = "ค้นหาบ่อยเกินไป (เกิน 60 ครั้งต่อนาที) กรุณารอสักครู่แล้วค้นใหม่";

/** โยนเมื่อค้นหาสาธารณะเกินจำนวนครั้ง หน้าเว็บจับแล้วแสดง PUBLIC_SEARCH_LIMITED */
export class SearchLimitedError extends Error {
  constructor() {
    super(PUBLIC_SEARCH_LIMITED);
    this.name = "SearchLimitedError";
  }
}

/** ค้นหาสาธารณะ 1 ครั้ง: คืน true = ค้นได้ */
export function publicSearchAllowed(): Promise<boolean> {
  return rateHit("public_search", PUBLIC_SEARCH_PER_MINUTE, "minute");
}

// ---------------------------------------------------------------
// ล็อกอินผิด: บัญชี+เครื่อง 5 ครั้ง หรือ เครื่อง 30 ครั้ง ใน 15 นาที = ระงับ 15 นาที
// ---------------------------------------------------------------
async function loginKeys(email: string) {
  const account = await clientKey("login", email.toLowerCase());
  const device = await clientKey("login-device");
  return account && device ? { account, device } : null;
}

/** เวลาที่ถูกระงับถึง (ISO) หรือ null */
export async function loginLockedUntil(email: string): Promise<string | null> {
  const keys = await loginKeys(email);
  if (!keys) return null;
  try {
    const { data } = await createAdminClient().rpc("login_attempt_status", { p_account_key: keys.account, p_device_key: keys.device });
    return (data as string | null) ?? null;
  } catch {
    return null;
  }
}

export async function loginFailed(email: string): Promise<string | null> {
  const keys = await loginKeys(email);
  if (!keys) return null;
  try {
    const { data } = await createAdminClient().rpc("login_attempt_failed", { p_account_key: keys.account, p_device_key: keys.device });
    return (data as string | null) ?? null;
  } catch {
    return null;
  }
}

export async function loginSucceeded(email: string): Promise<void> {
  const keys = await loginKeys(email);
  if (!keys) return;
  try {
    await createAdminClient().rpc("login_attempt_succeeded", { p_account_key: keys.account });
  } catch {
    // ไม่ให้การล้างตัวนับขัดการเข้าสู่ระบบ
  }
}

export function lockedMessage(until: string): string {
  const t = new Date(until).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
  return `ล็อกอินผิดหลายครั้ง ระบบระงับการเข้าสู่ระบบชั่วคราวถึงเวลา ${t} น. (ลืมรหัสผ่านให้ใช้ปุ่ม ลืมรหัสผ่าน)`;
}
