import { NextResponse, type NextRequest } from "next/server";

import { originFromHeaders, safeNext } from "@/lib/auth/origin";
import { createClient } from "@/lib/supabase/server";

/** ปลายทางของลิงก์ในอีเมล (แบบมี code) เช่น ลิงก์ตั้งรหัสผ่านใหม่ */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = originFromHeaders(request.headers);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"), "/account");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
