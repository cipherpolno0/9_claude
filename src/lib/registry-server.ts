import "server-only";

import { unstable_cache } from "next/cache";

import { parseTableParams, type TableParams } from "@/lib/data-table";
import { SECTS } from "@/lib/org-units";
import { isUuid } from "@/lib/persons-server";
import { PLACE_STATUSES, type CivilOption, type PlaceAddressParts, type PlaceType } from "@/lib/places";
import { PUBLIC_CACHE_SECONDS, PUBLIC_EXPORT_LIMIT, REGISTRY_TAG } from "@/lib/registry";
import { createPublicClient } from "@/lib/supabase/public";
import { VENUE_STATUSES, isVenueType, type OfficerRole, type VenueStatus, type VenueType } from "@/lib/venues";

/**
 * ข้อมูลของหน้าทะเบียนสาธารณะ อ่านด้วยบทบาท anon ผ่านฟังก์ชัน public_... เท่านั้น
 * ผลลัพธ์ถูกแคช 5 นาที (unstable_cache) และถูกล้างทันทีเมื่อมีการแก้ไขสถานที่หรือสนามสอบในพื้นที่ทำงาน
 * การค้นด้วยคำค้น (q) ไม่แคช เพราะคำค้นมีได้ไม่จำกัด
 */

const cacheOptions = { revalidate: PUBLIC_CACHE_SECONDS, tags: [REGISTRY_TAG] };

// ------------------------------------------------------------------
// ตัวเลือกของตัวกรอง
// ------------------------------------------------------------------

export type RegionOption = { id: string; name: string };

export const fetchPublicRegions = unstable_cache(
  async (): Promise<RegionOption[]> => {
    const { data } = await createPublicClient()
      .from("org_units")
      .select("id, name")
      .eq("level", "region")
      .eq("is_active", true)
      .order("code");
    return (data as RegionOption[] | null) ?? [];
  },
  ["registry-regions"],
  cacheOptions,
);

export const fetchPublicProvinces = unstable_cache(
  async (): Promise<CivilOption[]> => {
    const { data } = await createPublicClient().from("civil_provinces").select("code, name").eq("is_active", true).order("name");
    return (data as CivilOption[] | null) ?? [];
  },
  ["registry-provinces"],
  { revalidate: 3600, tags: [REGISTRY_TAG] },
);

export const fetchPublicDistricts = unstable_cache(
  async (provinceCode: number): Promise<CivilOption[]> => {
    const { data } = await createPublicClient()
      .from("civil_districts")
      .select("code, name, prefix")
      .eq("province_code", provinceCode)
      .eq("is_active", true)
      .order("name");
    return (data as CivilOption[] | null) ?? [];
  },
  ["registry-districts"],
  { revalidate: 3600, tags: [REGISTRY_TAG] },
);

export const fetchPublicSubdistricts = unstable_cache(
  async (districtCode: number): Promise<CivilOption[]> => {
    const { data } = await createPublicClient()
      .from("civil_subdistricts")
      .select("code, name, prefix")
      .eq("district_code", districtCode)
      .eq("is_active", true)
      .order("name");
    return (data as CivilOption[] | null) ?? [];
  },
  ["registry-subdistricts"],
  { revalidate: 3600, tags: [REGISTRY_TAG] },
);

// ------------------------------------------------------------------
// เงื่อนไขค้นหา (อ่านจากที่อยู่หน้าเว็บ แล้วตรวจให้เป็นค่าที่ถูกต้องเท่านั้น)
// ------------------------------------------------------------------

export type RegistryFilters = {
  q: string;
  region: string | null;
  province: number | null;
  district: number | null;
  subdistrict: number | null;
  sect: string | null;
  status: string | null;
  venueType: VenueType | null;
};

export function registryTableParams(raw: Record<string, string | string[] | undefined> | URLSearchParams): TableParams {
  return parseTableParams(raw, {
    sortable: [],
    defaultSort: "name",
    filters: ["region", "province", "district", "subdistrict", "sect", "status", "type"],
    pageSize: 20,
  });
}

/** อำเภอต้องอยู่ในจังหวัดที่เลือก และตำบลต้องอยู่ในอำเภอที่เลือก มิฉะนั้นไม่นำมาใช้ (เช่นเปลี่ยนจังหวัดแล้วค่าอำเภอเดิมค้างอยู่) */
export function readRegistryFilters(params: TableParams, venues: boolean): RegistryFilters {
  const f = params.filters;
  const province = /^\d{2}$/.test(f.province ?? "") ? Number(f.province) : null;
  const district = province !== null && /^\d{4}$/.test(f.district ?? "") && Math.floor(Number(f.district) / 100) === province ? Number(f.district) : null;
  const subdistrict =
    district !== null && /^\d{6}$/.test(f.subdistrict ?? "") && Math.floor(Number(f.subdistrict) / 100) === district
      ? Number(f.subdistrict)
      : null;
  const statuses: readonly string[] = venues ? VENUE_STATUSES : PLACE_STATUSES;
  return {
    q: params.q,
    region: isUuid(f.region ?? "") ? f.region : null,
    province,
    district,
    subdistrict,
    sect: (SECTS as readonly string[]).includes(f.sect) ? f.sect : null,
    status: statuses.includes(f.status) ? f.status : null,
    venueType: venues && isVenueType(f.type) ? f.type : null,
  };
}

// ------------------------------------------------------------------
// สถานที่
// ------------------------------------------------------------------

export type PublicPlaceRow = PlaceAddressParts & {
  id: string;
  code: string;
  name: string;
  place_type: PlaceType;
  sect: string | null;
  status: string;
  region_name: string | null;
  org_unit_name: string;
  office_phone: string;
  parent_place_id: string | null;
  parent_name: string | null;
  total_count: number;
};

async function loadPlaces(type: PlaceType, f: RegistryFilters, limit: number, offset: number) {
  const { data, error } = await createPublicClient().rpc("public_places", {
    p_type: type,
    p_q: f.q,
    p_region: f.region,
    p_province: f.province,
    p_district: f.district,
    p_subdistrict: f.subdistrict,
    p_sect: f.sect,
    p_status: f.status,
    p_limit: Math.min(limit, PUBLIC_EXPORT_LIMIT),
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  const rows = (data as PublicPlaceRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0) };
}
const loadPlacesCached = unstable_cache(loadPlaces, ["registry-places"], cacheOptions);

export function queryPublicPlaces(type: PlaceType, f: RegistryFilters, limit: number, offset: number) {
  return f.q ? loadPlaces(type, f, limit, offset) : loadPlacesCached(type, f, limit, offset);
}

export type PublicPlace = PlaceAddressParts & {
  id: string;
  code: string;
  name: string;
  place_type: PlaceType;
  sect: string | null;
  status: string;
  established_on: string | null;
  latitude: number | null;
  longitude: number | null;
  region_name: string | null;
  org_unit_name: string;
  office_phone: string;
  parent_place_id: string | null;
  parent_name: string | null;
  parent_type: PlaceType | null;
};

export type PublicRelated = {
  kind: "venue" | "place";
  id: string;
  code: string;
  name: string;
  subtype: string;
  levels: string[] | null;
  status: string;
};

export const fetchPublicPlace = unstable_cache(
  async (id: string): Promise<{ place: PublicPlace; related: PublicRelated[] } | null> => {
    if (!isUuid(id)) return null;
    const supabase = createPublicClient();
    const [place, related] = await Promise.all([
      supabase.rpc("public_place", { p_id: id }),
      supabase.rpc("public_place_related", { p_id: id }),
    ]);
    if (place.error) throw new Error(place.error.message);
    const row = (place.data as PublicPlace[] | null)?.[0];
    return row ? { place: row, related: (related.data as PublicRelated[] | null) ?? [] } : null;
  },
  ["registry-place"],
  cacheOptions,
);

// ------------------------------------------------------------------
// สนามสอบ
// ------------------------------------------------------------------

export type PublicVenueRow = PlaceAddressParts & {
  id: string;
  code: string;
  name: string;
  venue_type: VenueType;
  levels: string[];
  capacity: number | null;
  status: VenueStatus;
  sect: string | null;
  place_id: string | null;
  place_name: string;
  region_name: string | null;
  org_unit_name: string;
  total_count: number;
};

async function loadVenues(f: RegistryFilters, limit: number, offset: number) {
  const { data, error } = await createPublicClient().rpc("public_venues", {
    p_type: f.venueType,
    p_q: f.q,
    p_region: f.region,
    p_province: f.province,
    p_district: f.district,
    p_subdistrict: f.subdistrict,
    p_sect: f.sect,
    p_status: f.status,
    p_limit: Math.min(limit, PUBLIC_EXPORT_LIMIT),
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  const rows = (data as PublicVenueRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0) };
}
const loadVenuesCached = unstable_cache(loadVenues, ["registry-venues"], cacheOptions);

export function queryPublicVenues(f: RegistryFilters, limit: number, offset: number) {
  return f.q ? loadVenues(f, limit, offset) : loadVenuesCached(f, limit, offset);
}

export type PublicVenue = PlaceAddressParts & {
  id: string;
  code: string;
  name: string;
  venue_type: VenueType;
  levels: string[];
  capacity: number | null;
  status: VenueStatus;
  start_year_be: number | null;
  moved_to_venue_id: string | null;
  moved_to_name: string | null;
  sect: string | null;
  place_id: string | null;
  place_name: string;
  place_type: PlaceType;
  place_phone: string;
  latitude: number | null;
  longitude: number | null;
  region_name: string | null;
  org_unit_name: string;
};

/** ข้อมูลที่หน้าสาธารณะได้รับ มีเพียงเท่านี้ (ไม่มีที่อยู่จัดส่งข้อสอบ หมายเหตุ และรหัสบุคคล) */
export type PublicVenueOfficer = { role: OfficerRole; display_name: string; contact_phone: string | null; year_be: number };

export const fetchPublicVenue = unstable_cache(
  async (id: string): Promise<{ venue: PublicVenue; officers: PublicVenueOfficer[] } | null> => {
    if (!isUuid(id)) return null;
    const supabase = createPublicClient();
    const [venue, officers] = await Promise.all([
      supabase.rpc("public_venue", { p_id: id }),
      supabase.rpc("public_venue_officers", { p_venue_id: id }),
    ]);
    if (venue.error) throw new Error(venue.error.message);
    const row = (venue.data as PublicVenue[] | null)?.[0];
    return row ? { venue: row, officers: (officers.data as PublicVenueOfficer[] | null) ?? [] } : null;
  },
  ["registry-venue"],
  cacheOptions,
);
