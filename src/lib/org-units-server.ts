import "server-only";

import type { OrgUnit } from "@/lib/org-units";
import { createClient } from "@/lib/supabase/server";

export type AccessibleOrgUnit = OrgUnit & { selectable: boolean };

/**
 * เขตปกครองที่ผู้ใช้ปัจจุบันเข้าถึงได้ สำหรับส่งให้ OrgUnitPicker
 * รวมหน่วยเหนือของสายตนไว้ให้ไล่ชั้นลงมา (selectable = false)
 */
export async function fetchAccessibleUnits(): Promise<AccessibleOrgUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accessible_org_units");
  if (error) throw error;
  return (data as AccessibleOrgUnit[] | null) ?? [];
}

/** ทุกหน่วยที่ใช้งาน (หน่วยปลายทางของการโอนครุภัณฑ์ และหน่วยที่ส่งหนังสือถึง) */
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
