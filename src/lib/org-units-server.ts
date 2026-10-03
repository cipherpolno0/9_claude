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
