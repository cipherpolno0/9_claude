import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ตัวเชื่อม Supabase ของหน้าสาธารณะ: ใช้ publishable key โดยไม่มีรอบล็อกอิน (บทบาท anon ในฐานข้อมูล)
 * ไม่อ่านคุกกี้ จึงใช้ภายในฟังก์ชันที่แคชด้วย unstable_cache ได้ และเรียกได้เฉพาะสิ่งที่เปิดให้ anon
 * (ตารางอ้างอิงที่ทุกคนอ่านได้ และฟังก์ชัน public_...)  ข้อมูลที่ขึ้นกับผู้ใช้ให้ใช้ createClient() ใน server.ts
 */
let cached: SupabaseClient | null = null;

export function createPublicClient(): SupabaseClient {
  cached ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  return cached;
}
