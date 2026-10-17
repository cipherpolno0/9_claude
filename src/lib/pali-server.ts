import "server-only";

import { PALI_LEVEL_COLUMNS, type PaliLevel } from "@/lib/pali";
import { createClient } from "@/lib/supabase/server";

/** ชั้นประโยคบาลีทั้ง 2 สาย เรียงตามลำดับที่ผู้ดูแลระบบตั้ง (ทุกคนอ่านได้) */
export async function fetchPaliLevels(): Promise<PaliLevel[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("pali_levels").select(PALI_LEVEL_COLUMNS).order("sort_order");
  return (data as PaliLevel[] | null) ?? [];
}
