import "server-only";

import { requireMenu } from "@/lib/auth/guards";
import type { FiscalYear } from "@/lib/budget";
import { fetchBudgetUnits, fetchFiscalYears, pickBudgetUnit, pickFiscalYear } from "@/lib/budget-server";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";
import { createClient } from "@/lib/supabase/server";

export type BudgetScope = {
  ctx: Awaited<ReturnType<typeof requireMenu>>;
  years: FiscalYear[];
  year: FiscalYear | null;
  units: AccessibleOrgUnit[];
  unit: AccessibleOrgUnit | null;
  /** แก้ไข จัดสรร ยื่นคำขอโอน ของหน่วยที่เลือกได้หรือไม่ (ถามฐานข้อมูล) */
  unitEditable: boolean;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** ปีงบประมาณ (?year= พ.ศ.) และหน่วยที่ดู (?unit=) ของหน้างบประมาณ */
export async function loadBudgetScope(search: Record<string, string | string[] | undefined>): Promise<BudgetScope> {
  const ctx = await requireMenu("/app/budget");
  const [years, units] = await Promise.all([fetchFiscalYears(), ctx.canViewBudget ? fetchBudgetUnits() : Promise.resolve([])]);
  const unit = pickBudgetUnit(units, one(search.unit));
  let unitEditable = false;
  if (unit && ctx.canEditBudget) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("can_edit_budget", { p_org_unit_id: unit.id });
    unitEditable = data === true;
  }
  return { ctx, years, year: pickFiscalYear(years, one(search.year)), units, unit, unitEditable };
}

export function budgetQuery(year: FiscalYear | null, unit: { id: string } | null, extra: Record<string, string> = {}) {
  const q = new URLSearchParams();
  if (year) q.set("year", String(year.year_be));
  if (unit) q.set("unit", unit.id);
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  return q.toString();
}
