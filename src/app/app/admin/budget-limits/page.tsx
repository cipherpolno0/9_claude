import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { fetchApprovalLimits } from "@/lib/budget-server";
import { LEVEL_LABEL, type OrgLevel } from "@/lib/org-units";
import { createClient } from "@/lib/supabase/server";

import { LimitsForm } from "./limits-form";

export const metadata: Metadata = { title: "วงเงินอนุมัติงบประมาณ" };
export const dynamic = "force-dynamic";

const LEVELS: OrgLevel[] = ["subdistrict", "district", "province", "region"];
const ROLES = ["chief", "deputy_chief"];

export default async function BudgetLimitsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [limits, { data: roleRows }] = await Promise.all([
    fetchApprovalLimits(),
    supabase.from("roles").select("key, name").in("key", ROLES),
  ]);
  const roleName = new Map(((roleRows as { key: string; name: string }[] | null) ?? []).map((r) => [r.key, r.name]));
  const roles = ROLES.map((key) => ({ key, label: roleName.get(key) ?? key }));
  const levels = LEVELS.map((key) => ({ key, label: LEVEL_LABEL[key] }));
  const cells = limits.map((l) => ({
    id: l.id,
    level: l.level,
    levelLabel: LEVEL_LABEL[l.level as OrgLevel] ?? l.level,
    role: l.role_key,
    roleLabel: roleName.get(l.role_key) ?? l.role_key,
    amount: l.max_amount == null ? "" : String(Number(l.max_amount)),
  }));

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">วงเงินอนุมัติงบประมาณ</h1>
      <p className="mt-1 text-muted-foreground">
        กำหนดว่าเจ้าคณะและรองเจ้าคณะแต่ละชั้นอนุมัติคำขอใช้งบได้ไม่เกินเท่าใด เว้นว่าง = อนุมัติไม่ได้ ต้องส่งต่อชั้นถัดไป คำขอเริ่มที่หน่วยที่ใช้เงิน
        แล้วเห็นชอบทีละชั้นขึ้นไปจนถึงชั้นแรกที่มีวงเงินพอ ผู้อนุมัติขั้นสุดท้ายต้องมีวงเงินของตำแหน่งตนไม่น้อยกว่าจำนวนที่ขอ
      </p>
      <LimitsForm cells={cells} levels={levels} roles={roles} />
    </section>
  );
}
