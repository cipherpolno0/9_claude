import type { Instrumentation } from "next";

/**
 * ติดตามระบบ (บทที่ 32): ข้อผิดพลาดฝั่งเซิร์ฟเวอร์ทุกครั้ง (หน้าเว็บ Server Action Route Handler)
 * ถูกบันทึกลงตาราง app_error_logs ให้ผู้ดูแลระบบดูที่ /app/admin/system และแจ้งเตือนเมื่อเกิดถี่ผิดปกติ
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logAppError } = await import("@/lib/ops/log-error");
  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  await logAppError({
    source: "server",
    routeType: context.routeType,
    path: context.routePath || request.path,
    digest,
    message,
  });
};
