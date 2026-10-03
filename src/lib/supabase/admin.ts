import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ตัวเชื่อม Supabase ฝั่งเซิร์ฟเวอร์ที่ใช้ secret key (ข้าม RLS)
 * ใช้ชั่วคราวสำหรับหน้าผู้ดูแลระบบ จนกว่าจะมีล็อกอินและสิทธิ์ตามบทบาทในบทที่ 3
 * ห้าม import ไฟล์นี้จาก Client Component
 */

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
  const missing: string[] = [];
  if (!url || url.includes("xxxxxxxx")) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publishableKey) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!secretKey) missing.push("SUPABASE_SECRET_KEY");
  return { url, publishableKey, secretKey, missing };
}

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  const { url, secretKey, missing } = getSupabaseEnv();
  if (missing.length > 0) {
    throw new Error(`ยังไม่ได้ตั้งค่า ${missing.join(", ")} ในไฟล์ .env.local`);
  }
  cached ??= createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
