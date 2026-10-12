import "server-only";

import { appEnvironment } from "@/lib/environment";
import { createAdminClient, getSupabaseEnv } from "@/lib/supabase/admin";

/**
 * บันทึกข้อผิดพลาดลงตาราง app_error_logs (บทที่ 32) ผ่านฟังก์ชัน log_app_error ที่เรียกได้เฉพาะ service_role
 * ใช้ createAdminClient เพราะผู้เยี่ยมชมที่ไม่ล็อกอินก็ต้องบันทึกได้ และไม่เปิดฟังก์ชันนี้ให้ anon เรียกตรง (กันการยิงขยะเข้าตาราง)
 * path ตัดส่วน ?query ทิ้งที่นี่และในฐานข้อมูล (คำค้นอาจเป็นชื่อบุคคล) ข้อความยาวไม่เกิน 1,000 ตัวอักษร
 * ห้ามโยนข้อผิดพลาดต่อ: การบันทึกล้มเหลวต้องไม่ทำให้หน้าเว็บพังซ้ำ
 */
export async function logAppError(entry: {
  source: "server" | "client";
  routeType?: string;
  path?: string;
  digest?: string;
  message?: string;
  userId?: string | null;
}): Promise<void> {
  try {
    if (getSupabaseEnv().missing.length > 0) return;
    const { error } = await createAdminClient().rpc("log_app_error", {
      p_source: entry.source,
      p_route_type: (entry.routeType ?? "").slice(0, 40),
      p_path: (entry.path ?? "").split("?")[0].slice(0, 300),
      p_digest: (entry.digest ?? "").slice(0, 100),
      p_message: (entry.message ?? "").slice(0, 1000),
      p_environment: appEnvironment(),
      p_user: entry.userId ?? null,
    });
    if (error) console.error("log_app_error:", error.message);
  } catch (error) {
    console.error("log_app_error:", error instanceof Error ? error.message : error);
  }
}
