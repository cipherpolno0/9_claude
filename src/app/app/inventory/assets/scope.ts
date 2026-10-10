import "server-only";

import { requireMenu } from "@/lib/auth/guards";
import { fetchInventoryViewUnits } from "@/lib/assets-server";
import { pickBudgetUnit } from "@/lib/budget-server";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";
import { fiscalYearOf } from "@/lib/reports";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** ปีงบประมาณปัจจุบัน (ตามวันที่ประเทศไทย) */
export function currentFiscalYear(): number {
  return fiscalYearOf(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }));
}

/** หน่วยที่ดู (?unit= ต้องดูพัสดุได้; ไม่ระบุ = หน่วยบนสุดที่ดูได้) ?sub=0 เฉพาะหน่วยนี้ และ ?year= ปีงบประมาณ */
export async function loadAssetScope(search: Record<string, string | string[] | undefined>) {
  const ctx = await requireMenu("/app/inventory");
  const units: AccessibleOrgUnit[] = ctx.canViewInventory ? await fetchInventoryViewUnits() : [];
  const unit = pickBudgetUnit(units, one(search.unit));
  const sub = one(search.sub) !== "0";
  const cur = currentFiscalYear();
  const y = Number(one(search.year));
  const year = Number.isInteger(y) && y >= 2500 && y <= cur + 1 ? y : cur;
  return { ctx, units, unit, sub, year, currentYear: cur };
}

export function assetQuery(unit: { id: string } | null, extra: Record<string, string | null | undefined> = {}) {
  const q = new URLSearchParams();
  if (unit) q.set("unit", unit.id);
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  return q.toString();
}
