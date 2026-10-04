import "server-only";

import { parseTableParams, type TableParams } from "@/lib/data-table";
import type { Sect } from "@/lib/org-units";
import { isUuid } from "@/lib/persons-server";
import {
  PLACE_COLUMNS,
  PLACE_STATUSES,
  type CivilOption,
  type Place,
  type PlaceAddressParts,
  type PlaceStatus,
  type PlaceType,
} from "@/lib/places";
import { createClient } from "@/lib/supabase/server";

export type PlaceRow = PlaceAddressParts & {
  id: string;
  place_type: PlaceType;
  code: string;
  name: string;
  sect: Sect | null;
  org_unit_id: string;
  org_unit_name: string;
  org_unit_code: string;
  latitude: number | null;
  longitude: number | null;
  office_phone: string;
  email: string;
  responsible_name: string | null;
  status: PlaceStatus;
  established_on: string | null;
  parent_place_id: string | null;
  parent_name: string | null;
  parent_code: string | null;
  is_active: boolean;
  total_count: number;
};

export function placesTableParams(raw: Record<string, string | string[] | undefined> | URLSearchParams): TableParams {
  return parseTableParams(raw, {
    sortable: ["name", "code", "unit", "status"],
    defaultSort: "name",
    filters: ["unit", "province", "status"],
    pageSize: 10,
  });
}

export async function queryPlaces(type: PlaceType, params: TableParams, all = false) {
  const supabase = await createClient();
  const { unit, province, status } = params.filters;
  const { data, error } = await supabase.rpc("list_places", {
    p_type: type,
    p_q: params.q,
    p_unit: isUuid(unit ?? "") ? unit : null,
    p_province: /^\d{2}$/.test(province ?? "") ? Number(province) : null,
    p_status: status === "inactive" || (PLACE_STATUSES as readonly string[]).includes(status) ? status : null,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: all ? 10000 : params.pageSize,
    p_offset: all ? 0 : params.from,
  });
  const rows = (data as PlaceRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error };
}

export async function fetchPlaceTypeCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("place_type_counts");
  return Object.fromEntries(((data as { place_type: string; total: number }[] | null) ?? []).map((r) => [r.place_type, Number(r.total)]));
}

export type PlaceDetail = Place &
  PlaceAddressParts & {
    org_unit_name: string;
    parent_name: string | null;
    parent_code: string | null;
    responsible_name: string | null;
  };

type Named = { name: string; prefix?: string } | null;

/** คืน null ถ้าไม่พบ หรือ RLS ไม่ให้เห็นสถานที่นี้ */
export async function fetchPlace(id: string): Promise<PlaceDetail | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select(
      `${PLACE_COLUMNS}, org_units(name), civil_subdistricts(name, prefix), civil_districts(name, prefix), civil_provinces(name), parent:parent_place_id(name, code)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { org_units, civil_subdistricts, civil_districts, civil_provinces, parent, ...place } = data as unknown as Place & {
    org_units: { name: string } | null;
    civil_subdistricts: Named;
    civil_districts: Named;
    civil_provinces: Named;
    parent: { name: string; code: string } | null;
  };
  let responsible: string | null = null;
  if (place.responsible_person_id) {
    const { data: name } = await supabase.rpc("place_responsible_name", { p_place_id: place.id });
    responsible = (name as string | null) ?? null;
  }
  return {
    ...place,
    org_unit_name: org_units?.name ?? "",
    subdistrict_name: civil_subdistricts?.name ?? null,
    subdistrict_prefix: civil_subdistricts?.prefix ?? null,
    district_name: civil_districts?.name ?? null,
    district_prefix: civil_districts?.prefix ?? null,
    province_name: civil_provinces?.name ?? null,
    parent_name: parent?.name ?? null,
    parent_code: parent?.code ?? null,
    responsible_name: responsible,
  };
}

export async function canEditPlace(orgUnitId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("can_edit_places", { p_org_unit_id: orgUnitId });
  return data === true;
}

export async function fetchChildPlaces(templeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select("id, place_type, code, name, status, is_active")
    .eq("parent_place_id", templeId)
    .order("name");
  return (data as Pick<Place, "id" | "place_type" | "code" | "name" | "status" | "is_active">[] | null) ?? [];
}

export type PlaceHistoryLog = {
  id: number;
  action: string;
  table_name: string;
  row_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
};

export async function fetchPlaceHistory(placeId: string): Promise<PlaceHistoryLog[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("place_history", { p_place_id: placeId });
  return (data as PlaceHistoryLog[] | null) ?? [];
}

// ------------------------------------------------------------------
// เขตการปกครองบ้านเมือง
// ------------------------------------------------------------------

export async function fetchCivilProvinces(): Promise<CivilOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("civil_provinces").select("code, name").eq("is_active", true).order("name");
  return (data as CivilOption[] | null) ?? [];
}

export type CivilRow = {
  province_code: number;
  province_name: string;
  district_code: number;
  district_name: string;
  district_prefix: string;
  subdistrict_code: number;
  subdistrict_name: string;
  subdistrict_prefix: string;
  postal_code: string;
};

/** ตำบลทั้งหมดพร้อมอำเภอและจังหวัด (อ่านเป็นช่วง ช่วงละ 1,000 แถว) กรองตามจังหวัดได้ */
export async function fetchCivilRows(provinceCode: number | null = null): Promise<CivilRow[]> {
  const supabase = await createClient();
  type Raw = {
    code: number;
    name: string;
    prefix: string;
    postal_code: string;
    civil_districts: { code: number; name: string; prefix: string; civil_provinces: { code: number; name: string } };
  };
  const all: CivilRow[] = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from("civil_subdistricts")
      .select("code, name, prefix, postal_code, civil_districts!inner(code, name, prefix, civil_provinces!inner(code, name))")
      .order("code")
      .range(from, from + 999);
    if (provinceCode !== null) query = query.gte("code", provinceCode * 10000).lt("code", (provinceCode + 1) * 10000);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data as unknown as Raw[] | null) ?? [];
    all.push(
      ...rows.map((s) => ({
        province_code: s.civil_districts.civil_provinces.code,
        province_name: s.civil_districts.civil_provinces.name,
        district_code: s.civil_districts.code,
        district_name: s.civil_districts.name,
        district_prefix: s.civil_districts.prefix,
        subdistrict_code: s.code,
        subdistrict_name: s.name,
        subdistrict_prefix: s.prefix,
        postal_code: s.postal_code,
      })),
    );
    if (rows.length < 1000) break;
  }
  return all;
}
