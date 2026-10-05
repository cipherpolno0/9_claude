import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** คุกกี้รหัสอุปกรณ์ของผู้เรียนที่ไม่ล็อกอิน (ต้องตรงกับ QUIZ_DEVICE_COOKIE ใน src/lib/quiz-learn-server.ts) */
const QUIZ_DEVICE_COOKIE = "quiz_device";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * ทำงานก่อนทุกคำขอของหน้า /app, /account และ /quiz
 * 1) ต่ออายุรอบล็อกอิน (คุกกี้) 2) หน้า /app และ /account: ถ้ายังไม่ล็อกอิน ส่งไปหน้าเข้าสู่ระบบ
 * 3) หน้า /quiz (เรียนได้โดยไม่ล็อกอิน): ออกรหัสอุปกรณ์แบบสุ่มเก็บในคุกกี้ ใช้จำความคืบหน้าของผู้ที่ไม่ล็อกอิน
 * การตรวจสิทธิ์ละเอียด (สถานะบัญชี บทบาท 2 ขั้น อายุรหัสผ่าน) อยู่ที่ src/lib/auth/guards.ts
 */
export async function proxy(request: NextRequest) {
  const isQuiz = request.nextUrl.pathname === "/quiz" || request.nextUrl.pathname.startsWith("/quiz/");
  let newDevice: string | null = null;
  if (isQuiz && !UUID.test(request.cookies.get(QUIZ_DEVICE_COOKIE)?.value ?? "")) {
    newDevice = crypto.randomUUID();
    // ใส่ในคำขอด้วย เพื่อให้หน้าที่กำลังจะแสดงผลอ่านรหัสนี้ได้ทันที
    request.cookies.set(QUIZ_DEVICE_COOKIE, newDevice);
  }
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && !isQuiz) {
      const login = request.nextUrl.clone();
      login.pathname = "/login";
      login.search = "";
      login.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(login);
    }
  }

  if (newDevice) {
    response.cookies.set(QUIZ_DEVICE_COOKIE, newDevice, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/account/:path*", "/quiz/:path*"],
};
