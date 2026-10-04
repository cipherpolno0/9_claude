import "server-only";

import { isUuid } from "@/lib/persons-server";
import { createClient } from "@/lib/supabase/server";
import { isVenueType, type VenueType } from "@/lib/venues";
import { fetchAcademicYears, pickYear } from "@/lib/venues-server";

type Raw = Record<string, string | string[] | undefined> | URLSearchParams;

function read(raw: Raw, key: string): string {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? "";
  const v = raw[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** อ่านเงื่อนไขรายงานบัญชีสนามสอบจากที่อยู่หน้าเว็บ (?year= &unit= &type=) ใช้ร่วมกันทั้งหน้าจอ Excel และหน้าพิมพ์ */
export async function readVenueReportParams(raw: Raw) {
  const years = await fetchAcademicYears();
  const year = pickYear(years, read(raw, "year"));
  const type: VenueType | null = isVenueType(read(raw, "type")) ? (read(raw, "type") as VenueType) : null;
  const unitId = read(raw, "unit");
  let unit: { id: string; name: string } | null = null;
  if (isUuid(unitId)) {
    const supabase = await createClient();
    const { data } = await supabase.from("org_units").select("id, name").eq("id", unitId).maybeSingle();
    unit = (data as { id: string; name: string } | null) ?? null;
  }
  return { years, year, type, unit };
}

export function venueReportQuery(yearBe: number | undefined, unitId: string | undefined, type: VenueType | null): string {
  const q = new URLSearchParams();
  if (yearBe) q.set("year", String(yearBe));
  if (unitId) q.set("unit", unitId);
  if (type) q.set("type", type);
  return q.toString();
}
