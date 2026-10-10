import "server-only";

import type { AccessibleOrgUnit } from "@/lib/org-units-server";
import { createClient } from "@/lib/supabase/server";

import type {
  AssetDetail,
  AssetRow,
  AssetTransferRow,
  AssetType,
  CompareRow,
  CountDetail,
  CountRow,
  DepreciationRow,
  IssueReportRow,
  SourceOption,
} from "./assets";

/** ตัวอ่านข้อมูลครุภัณฑ์ (ทำงานในนามผู้ใช้ สิทธิ์ตรวจในฐานข้อมูลตามขอบเขตพัสดุ) */

export async function fetchAssetTypes({ includeInactive = false } = {}): Promise<AssetType[]> {
  const supabase = await createClient();
  let q = supabase.from("asset_types").select("id, name, useful_life_years, sort_order, is_active").order("sort_order").order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as AssetType[] | null) ?? [];
}

export async function fetchSourceOptions(): Promise<SourceOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("budget_sources").select("id, name, is_active").order("sort_order").order("name");
  return (data as SourceOption[] | null) ?? [];
}

/** หน่วยที่ผู้ใช้ดูพัสดุได้ (ตัวเลือกเขตของหน้าครุภัณฑ์และรายงาน) */
export async function fetchInventoryViewUnits(): Promise<AccessibleOrgUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inventory_view_units");
  if (error) return [];
  return (data as AccessibleOrgUnit[] | null) ?? [];
}

export async function fetchAssetRows(unitId: string, sub: boolean, inactive = false): Promise<AssetRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("asset_rows", { p_unit: unitId, p_sub: sub, p_inactive: inactive });
  if (error) return [];
  return (data as AssetRow[] | null) ?? [];
}

export async function fetchAssetDetail(id: string): Promise<AssetDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("asset_detail", { p_id: id });
  if (error) return null;
  return (data as AssetDetail | null) ?? null;
}

export async function fetchAssetTransfers(): Promise<AssetTransferRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("asset_transfer_rows");
  if (error) return [];
  return (data as AssetTransferRow[] | null) ?? [];
}

export async function fetchCountRows(): Promise<CountRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("asset_count_rows");
  if (error) return [];
  return (data as CountRow[] | null) ?? [];
}

export async function fetchCountDetail(id: string): Promise<CountDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("asset_count_detail", { p_id: id });
  if (error) return null;
  return (data as CountDetail | null) ?? null;
}

export async function fetchDepreciation(yearBe: number, unitId: string, sub: boolean): Promise<DepreciationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("asset_depreciation", { p_year_be: yearBe, p_unit: unitId, p_sub: sub });
  if (error) return [];
  return (data as DepreciationRow[] | null) ?? [];
}

export async function fetchIssueReport(yearBe: number, unitId: string, sub: boolean): Promise<IssueReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inventory_issue_report", { p_year_be: yearBe, p_unit: unitId, p_sub: sub });
  if (error) return [];
  return (data as IssueReportRow[] | null) ?? [];
}

export async function fetchUnitCompare(yearBe: number, unitId: string): Promise<CompareRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("asset_unit_compare", { p_year_be: yearBe, p_unit: unitId });
  if (error) return [];
  return (data as CompareRow[] | null) ?? [];
}

/** รูปครุภัณฑ์: รูปล่าสุดที่แนบ (ลิงก์ชั่วคราว 5 นาที) */
export async function fetchAssetPhotoUrl(assetId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("entity_table", "assets")
    .eq("entity_id", assetId)
    .eq("is_active", true)
    .like("mime_type", "image/%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const { data: signed } = await supabase.storage.from("attachments").createSignedUrl((data as { storage_path: string }).storage_path, 300);
  return signed?.signedUrl ?? null;
}

/** หน่วยปลายทางของการโอนครุภัณฑ์: ทุกหน่วยที่ใช้งาน (โอนข้ามสายได้ ปลายทางต้องมีผู้มีสิทธิ์พัสดุกดรับ) */
export async function fetchAllActiveUnits(): Promise<AccessibleOrgUnit[]> {
  const supabase = await createClient();
  const all: AccessibleOrgUnit[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("org_units")
      .select("id, parent_id, level, sect, name, code, is_active")
      .eq("is_active", true)
      .order("code")
      .range(from, from + 999);
    if (error) throw error;
    all.push(...((data as Omit<AccessibleOrgUnit, "selectable">[]) ?? []).map((u) => ({ ...u, selectable: true })));
    if (!data || data.length < 1000) break;
  }
  return all;
}
