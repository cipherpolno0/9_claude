import { appEnvironment } from "@/lib/environment";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * ตรวจสถานะระบบ (บทที่ 32) สำหรับบริการเฝ้าระบบภายนอก (เช่น UptimeRobot) เรียกทุก 5 นาที
 * 200 = เว็บและฐานข้อมูลทำงาน / 503 = ฐานข้อมูลไม่ตอบภายใน 5 วินาที  ไม่คืนข้อมูลภายในใด ๆ
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let database: "ok" | "error" = "error";
  try {
    const result = await Promise.race([
      createPublicClient().rpc("health_ping"),
      new Promise<{ error: Error }>((resolve) => setTimeout(() => resolve({ error: new Error("timeout") }), 5000)),
    ]);
    database = result.error ? "error" : "ok";
  } catch {
    database = "error";
  }
  const ok = database === "ok";
  return Response.json(
    {
      status: ok ? "ok" : "error",
      database,
      environment: appEnvironment(),
      version: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
      time: new Date().toISOString(),
      ms: Date.now() - started,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
