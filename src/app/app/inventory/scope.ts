import "server-only";

import { requireMenu } from "@/lib/auth/guards";
import type { Warehouse } from "@/lib/inventory";
import { fetchWarehouses } from "@/lib/inventory-server";
import { createClient } from "@/lib/supabase/server";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export type InventoryScope = {
  ctx: Awaited<ReturnType<typeof requireMenu>>;
  warehouses: Warehouse[];
  warehouse: Warehouse | null;
  /** รับเข้า จ่ายของ โอน ปรับยอด ของคลังที่เลือกได้หรือไม่ (ถามฐานข้อมูล) */
  editable: boolean;
};

/** คลังที่ผู้ใช้เห็น และคลังที่เลือก (?w=; ไม่ระบุ = คลังแรก) */
export async function loadInventory(search: Record<string, string | string[] | undefined>): Promise<InventoryScope> {
  const ctx = await requireMenu("/app/inventory");
  const warehouses = ctx.canViewInventory ? await fetchWarehouses() : [];
  const wanted = one(search.w);
  const warehouse = warehouses.find((w) => w.id === wanted) ?? warehouses[0] ?? null;
  return { ctx, warehouses, warehouse, editable: warehouse ? await canEditUnit(warehouse.org_unit_id, ctx.canEditInventory) : false };
}

export async function canEditUnit(unitId: string, canEditAny: boolean): Promise<boolean> {
  if (!canEditAny) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("can_edit_inventory", { p_org_unit_id: unitId });
  return data === true;
}
