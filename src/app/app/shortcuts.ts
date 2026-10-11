import type { AuthContext } from "@/lib/auth/session";

export type Shortcut = { href: string; label: string };

/** ทางลัดบนแดชบอร์ดตามบทบาทและสิทธิ์ (แสดงเฉพาะสิ่งที่ผู้ใช้ทำได้ ฐานข้อมูลตรวจสิทธิ์ซ้ำทุกหน้า) */
export function roleShortcuts(ctx: AuthContext): Shortcut[] {
  const menu = (href: string) => ctx.allMenus || ctx.allowedMenus.includes(href);
  const out: Shortcut[] = [];
  const add = (cond: boolean, href: string, label: string) => {
    if (cond && !out.some((s) => s.href === href)) out.push({ href, label });
  };
  add(ctx.canEditDocs && menu("/app/docs"), "/app/docs/receive/new", "ลงทะเบียนหนังสือรับ");
  add(ctx.canEditDocs && menu("/app/docs"), "/app/docs/new", "ร่างหนังสือส่ง");
  add(ctx.canViewDocs && menu("/app/docs"), "/app/docs/search", "ค้นหาหนังสือ");
  add(ctx.canEditPersonnel && menu("/app/personnel"), "/app/personnel/new", "เพิ่มบุคลากร");
  add(menu("/app/personnel"), "/app/personnel/lookup", "ตรวจสอบบุคลากร");
  add((ctx.canEditPlaces || ctx.canEditVenues) && menu("/app/requests"), "/app/requests/new", "ยื่นคำขอสำนัก / สนามสอบ");
  add(ctx.canManageExamRounds && menu("/app/exams"), "/app/exams/rounds", "รอบสมัครสอบ");
  add(ctx.canManageExamRounds && menu("/app/exams"), "/app/exams/totals", "ยอดผู้สมัครต่อสนามสอบ");
  add(menu("/app/exams"), "/app/exams/batches", "บัญชีผู้สมัครสอบ");
  add(ctx.canManageQuiz && menu("/app/quiz"), "/app/quiz/questions", "คลังข้อสอบ");
  add(ctx.canEditBudget && menu("/app/budget"), "/app/budget/uses/new", "ขอใช้งบประมาณ");
  add(ctx.canViewInventory && menu("/app/inventory"), "/app/inventory/requisitions", "ใบเบิกวัสดุ");
  add(ctx.canManageSiteContent, "/app/admin/announcements", "ข่าวประกาศ");
  add(ctx.canManageSiteContent, "/app/admin/downloads", "ดาวน์โหลด");
  add(ctx.isAdmin, "/app/admin/users", "บัญชีผู้ใช้");
  add(ctx.isAdmin, "/app/admin/contact", "ข้อมูลติดต่อและผู้รับข้อความ");
  return out;
}
