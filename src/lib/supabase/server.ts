import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * ตัวเชื่อม Supabase ฝั่งเซิร์ฟเวอร์ที่ทำงานในนามของผู้ใช้ที่ล็อกอินอยู่ (อยู่ใต้ RLS)
 * ใช้ตัวนี้เป็นหลักในทุกหน้าและทุก Server Action
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // เรียกจาก Server Component ซึ่งตั้งคุกกี้ไม่ได้ ปล่อยให้ proxy.ts เป็นผู้ต่ออายุแทน
          }
        },
      },
    },
  );
}
