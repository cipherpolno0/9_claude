import "server-only";

import type { BudgetTreeRow } from "@/lib/budget";

/** หมวดรายจ่ายที่หน่วยถืออยู่ (เป็นเจ้าของหรือได้รับจัดสรร) พร้อมเส้นทางชื่อ และยอดคงเหลือ */
export function heldCategories(rows: BudgetTreeRow[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pathOf = (id: string | null): string => {
    const r = id ? byId.get(id) : undefined;
    return r ? [pathOf(r.parent_id), r.label].filter(Boolean).join(" > ") : "";
  };
  return rows
    .filter((r) => r.kind === "category" && r.is_active && Number(r.received) > 0)
    .map((r) => ({ id: r.id, path: pathOf(r.id), free: Number(r.remaining) }));
}
