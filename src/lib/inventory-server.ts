import "server-only";

import type { AccessibleOrgUnit } from "@/lib/org-units-server";
import { createClient } from "@/lib/supabase/server";

import type {
  CardRow,
  Category,
  DisbursementOption,
  InventorySummary,
  Item,
  ItemOption,
  LowStockRow,
  ReceiptDetail,
  ReceiptRow,
  RequisitionDetail,
  RequisitionRow,
  RequisitionTab,
  StockRow,
  TransferDetail,
  TransferRow,
  Warehouse,
} from "./inventory";

/** ตัวอ่านข้อมูลคลังวัสดุ (ทำงานในนามผู้ใช้ สิทธิ์ตรวจในฐานข้อมูล: RLS หรือฟังก์ชันที่ตรวจ can_view_inventory เอง) */

type WarehouseDb = Omit<Warehouse, "unit_name" | "parent_name"> & {
  unit: { name: string } | null;
  parent: { name: string } | null;
};

/** คลังที่ผู้ใช้เห็น (หน่วยตนและหน่วยใต้สังกัดตามขอบเขต) เรียงคลังกลางก่อน */
export async function fetchWarehouses({ includeInactive = false } = {}): Promise<Warehouse[]> {
  const supabase = await createClient();
  let q = supabase
    .from("warehouses")
    .select("id, org_unit_id, kind, parent_id, code, name, note, is_active, unit:org_unit_id(name), parent:parent_id(name)")
    .order("kind")
    .order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return ((data as unknown as WarehouseDb[] | null) ?? []).map(({ unit, parent, ...w }) => ({
    ...w,
    unit_name: unit?.name ?? "",
    parent_name: parent?.name ?? null,
  }));
}

export async function fetchCategories({ includeInactive = false } = {}): Promise<Category[]> {
  const supabase = await createClient();
  let q = supabase.from("inventory_categories").select("id, name, sort_order, is_active").order("sort_order").order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Category[] | null) ?? [];
}

export async function fetchItems({ includeInactive = false } = {}): Promise<Item[]> {
  const supabase = await createClient();
  let q = supabase
    .from("items")
    .select("id, code, name, category_id, unit, reorder_point, note, is_active, category:category_id(name)")
    .order("code");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return ((data as unknown as (Omit<Item, "category_name"> & { category: { name: string } | null })[] | null) ?? []).map(
    ({ category, ...i }) => ({ ...i, category_name: category?.name ?? null }),
  );
}

export async function fetchItem(id: string): Promise<Item | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("id, code, name, category_id, unit, reorder_point, note, is_active, category:category_id(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { category, ...i } = data as unknown as Omit<Item, "category_name"> & { category: { name: string } | null };
  return { ...i, category_name: category?.name ?? null };
}

export async function fetchStock(warehouseId: string): Promise<StockRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inventory_stock", { p_warehouse: warehouseId });
  if (error) return [];
  return (data as StockRow[] | null) ?? [];
}

/** ตัวเลือกวัสดุของฟอร์ม: วัสดุที่ใช้งาน พร้อมยอดคงเหลือในคลังที่เลือก */
export async function fetchItemOptions(warehouseId: string): Promise<ItemOption[]> {
  const rows = await fetchStock(warehouseId);
  return rows
    .filter((r) => r.is_active)
    .map((r) => ({ id: r.item_id, code: r.code, name: r.name, unit: r.unit, category: r.category_name, balance: Number(r.balance) }));
}

export async function fetchLowStock(): Promise<LowStockRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inventory_low_stock");
  if (error) return [];
  return (data as LowStockRow[] | null) ?? [];
}

export async function fetchInventorySummary(): Promise<InventorySummary> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("inventory_summary");
  const s = (data as Partial<InventorySummary> | null) ?? {};
  return {
    my_open: Number(s.my_open ?? 0),
    to_approve: Number(s.to_approve ?? 0),
    to_issue: Number(s.to_issue ?? 0),
    incoming: Number(s.incoming ?? 0),
    low_stock: Number(s.low_stock ?? 0),
  };
}

export async function fetchStockCard(warehouseId: string, itemId: string): Promise<CardRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_card", { p_warehouse: warehouseId, p_item: itemId });
  if (error) return null;
  return (data as CardRow[] | null) ?? [];
}

export async function fetchRequisitionRows(tab: RequisitionTab): Promise<RequisitionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("requisition_rows", { p_tab: tab });
  if (error) return [];
  return (data as RequisitionRow[] | null) ?? [];
}

export async function fetchRequisitionDetail(id: string): Promise<RequisitionDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("requisition_detail", { p_id: id });
  if (error) return null;
  return (data as RequisitionDetail | null) ?? null;
}

export async function fetchTransferRows(warehouseId: string | null = null): Promise<TransferRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_rows", { p_warehouse: warehouseId });
  if (error) return [];
  return (data as TransferRow[] | null) ?? [];
}

export async function fetchTransferDetail(id: string): Promise<TransferDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfer_detail", { p_id: id });
  if (error) return null;
  return (data as TransferDetail | null) ?? null;
}

export async function fetchReceiptRows(warehouseId: string): Promise<ReceiptRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receipt_rows", { p_warehouse: warehouseId });
  if (error) return [];
  return (data as ReceiptRow[] | null) ?? [];
}

export async function fetchReceiptDetail(id: string): Promise<ReceiptDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receipt_detail", { p_id: id });
  if (error) return null;
  return (data as ReceiptDetail | null) ?? null;
}

export async function fetchDisbursementOptions(warehouseId: string): Promise<DisbursementOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inventory_disbursement_options", { p_warehouse: warehouseId });
  if (error) return [];
  return (data as DisbursementOption[] | null) ?? [];
}

/** รูปวัสดุ: รูปแรกที่แนบกับวัสดุ (ลิงก์ชั่วคราว 5 นาที) */
export async function fetchItemPhotoUrl(itemId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("entity_table", "items")
    .eq("entity_id", itemId)
    .eq("is_active", true)
    .like("mime_type", "image/%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const { data: signed } = await supabase.storage.from("attachments").createSignedUrl((data as { storage_path: string }).storage_path, 300);
  return signed?.signedUrl ?? null;
}

/** หน่วยที่สร้างคลังได้ (ขอบเขตแก้ไขพัสดุ) รูปแบบเดียวกับ fetchAccessibleUnits() ใช้กับ OrgUnitPicker */
export async function fetchInventoryEditUnits(): Promise<AccessibleOrgUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inventory_edit_units");
  if (error) return [];
  return (data as AccessibleOrgUnit[] | null) ?? [];
}
