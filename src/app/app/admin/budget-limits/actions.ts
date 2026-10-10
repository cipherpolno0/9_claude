"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/guards";
import { isUuid, parseMoney } from "@/lib/budget";
import { explainError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** บันทึกวงเงินอนุมัติคำขอใช้งบต่อชั้นและตำแหน่ง (ว่าง = อนุมัติไม่ได้ ส่งต่อชั้นถัดไป) RLS ยอมเฉพาะผู้ดูแลระบบ */
export async function saveApprovalLimits(values: { id: string; amount: string }[]): Promise<ActionResult> {
  await requireAdmin();
  const rows = (Array.isArray(values) ? values : []).slice(0, 20);
  const clean: { id: string; max: string | null }[] = [];
  for (const v of rows) {
    if (!isUuid(v?.id)) return { ok: false, error: "ข้อมูลไม่ถูกต้อง" };
    const raw = String(v.amount ?? "").trim();
    if (!raw) {
      clean.push({ id: v.id, max: null });
      continue;
    }
    const m = parseMoney(raw);
    if (m === null || Number(m) <= 0) return { ok: false, error: `วงเงิน "${raw}" ไม่ถูกต้อง ต้องมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง หรือเว้นว่าง` };
    clean.push({ id: v.id, max: m });
  }
  const supabase = await createClient();
  for (const c of clean) {
    const { data, error } = await supabase.from("budget_approval_limits").update({ max_amount: c.max }).eq("id", c.id).select("id");
    if (error) return { ok: false, error: explainError(error) };
    if (!data?.length) return { ok: false, error: "แก้ไขได้เฉพาะผู้ดูแลระบบ" };
  }
  revalidatePath("/app/admin/budget-limits");
  return { ok: true, message: "บันทึกวงเงินอนุมัติแล้ว มีผลกับคำขอที่ยื่นหลังจากนี้ และการอนุมัติขั้นสุดท้ายของคำขอที่ค้างอยู่" };
}
