import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { originFromHeaders, safeNext } from "@/lib/auth/origin";
import { createClient } from "@/lib/supabase/server";

/** ปลายทางของลิงก์ในอีเมล (แบบมี token_hash) ใช้เมื่อปรับแม่แบบอีเมลใน Supabase ให้ชี้มาที่นี่ */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = originFromHeaders(request.headers);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"), "/account/password");

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
