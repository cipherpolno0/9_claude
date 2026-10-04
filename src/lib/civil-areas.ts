"use server";

import type { CivilOption } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";

/** ตัวเลือกที่อยู่แบบไล่ชั้น (เขตการปกครองบ้านเมืองเป็นข้อมูลอ้างอิงที่ทุกคนอ่านได้) */
export async function loadCivilDistricts(provinceCode: number): Promise<CivilOption[]> {
  if (!Number.isInteger(provinceCode)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("civil_districts")
    .select("code, name, prefix")
    .eq("province_code", provinceCode)
    .eq("is_active", true)
    .order("name");
  return (data as CivilOption[] | null) ?? [];
}

export async function loadCivilSubdistricts(districtCode: number): Promise<CivilOption[]> {
  if (!Number.isInteger(districtCode)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("civil_subdistricts")
    .select("code, name, prefix, postal_code")
    .eq("district_code", districtCode)
    .eq("is_active", true)
    .order("name");
  return (data as CivilOption[] | null) ?? [];
}
