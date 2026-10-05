import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { getAuthContext, type AuthContext } from "./session";

/**
 * ด่านตรวจของพื้นที่ทำงาน (/app/...) เรียกทั้งใน layout และในทุกหน้า
 * ลำดับ: ล็อกอิน > บัญชีใช้งานได้ (รวมกฎระงับอัตโนมัติ) > ยืนยันตัวตน 2 ขั้น > อายุรหัสผ่าน
 */
export const requireWorkspace = cache(async (): Promise<AuthContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ตรวจกฎระงับอัตโนมัติและบันทึกเวลาเข้าใช้ล่าสุด
  const { data: state } = await supabase.rpc("enforce_my_account");
  if ((state as { status?: string } | null)?.status !== "active") redirect("/account");

  const ctx = await getAuthContext();
  if (!ctx || !ctx.profile || ctx.profile.status !== "active") redirect("/account");
  if (!ctx.mfaSatisfied) redirect("/account/mfa");
  if (ctx.passwordExpired) redirect("/account/password?expired=1");
  return ctx;
});

/** หน้าของเมนูใดเมนูหนึ่ง: ต้องมีบทบาทที่เห็นเมนูนั้น */
export async function requireMenu(href: string): Promise<AuthContext> {
  const ctx = await requireWorkspace();
  if (!ctx.allMenus && !ctx.allowedMenus.includes(href)) redirect("/app?denied=1");
  return ctx;
}

/** หน้าจัดการคลังข้อสอบ: ต้องเห็นเมนู คลังข้อสอบ และเป็นผู้จัดการคลังข้อสอบหรือผู้ดูแลระบบ */
export async function requireQuizManager(): Promise<AuthContext> {
  const ctx = await requireMenu("/app/quiz");
  if (!ctx.canManageQuiz) redirect("/app/quiz");
  return ctx;
}

/** เฉพาะผู้ดูแลระบบ */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireWorkspace();
  if (!ctx.isAdmin) redirect("/app?denied=1");
  return ctx;
}

/** ผู้ดูแลระบบและผู้อนุมัติบัญชี (เจ้าคณะ รองเจ้าคณะ เลขานุการ เจ้าหน้าที่ส่วนกลาง) */
export async function requireAccountManager(): Promise<AuthContext> {
  const ctx = await requireWorkspace();
  if (!ctx.isAccountManager) redirect("/app?denied=1");
  return ctx;
}

/** หน้าบัญชีของฉัน: ต้องล็อกอิน แต่ไม่ต้องผ่านด่านอื่น */
export async function requireLogin(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}
