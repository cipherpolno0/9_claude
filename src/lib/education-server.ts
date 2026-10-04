import "server-only";

import { parseTableParams, type TableParams } from "@/lib/data-table";
import {
  STAFF_STATUSES,
  type EducationPositionType,
  type EducationStaff,
  type StaffStatus,
  type Track,
} from "@/lib/education";
import type { OrgLevel } from "@/lib/org-units";
import { isUuid } from "@/lib/persons-server";
import type { PersonType } from "@/lib/persons";
import { createClient } from "@/lib/supabase/server";

export async function fetchEducationPositionTypes(): Promise<EducationPositionType[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("education_position_types")
    .select("id, track, name, sort_order, is_active")
    .order("track")
    .order("sort_order")
    .order("name");
  return (data as EducationPositionType[] | null) ?? [];
}

/** รายการ จศป. ของบุคคลหนึ่ง (ทุกแท่ง รวมรายการที่ยกเลิก) */
export async function fetchEducationStaff(personId: string): Promise<EducationStaff[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("education_staff")
    .select(
      "id, person_id, track, position_type_id, school_name, school_type, org_unit_id, started_on, order_no, subjects, status, ended_on, note, is_active, education_position_types(name), org_units(name)",
    )
    .eq("person_id", personId)
    .order("is_active", { ascending: false })
    .order("track")
    .order("started_on", { ascending: false, nullsFirst: false });
  type Row = Omit<EducationStaff, "position_name" | "org_unit_name"> & {
    education_position_types: { name: string } | null;
    org_units: { name: string } | null;
  };
  return ((data as unknown as Row[] | null) ?? []).map(({ education_position_types, org_units, ...e }) => ({
    ...e,
    position_name: education_position_types?.name ?? "",
    org_unit_name: org_units?.name ?? "",
  }));
}

// ------------------------------------------------------------------
// หน้ารายชื่อ จศป. (ตารางข้อมูลกลาง) ใช้ร่วมกันทั้งหน้าจอและการส่งออก Excel
// ------------------------------------------------------------------

export type EducationRow = {
  id: string;
  person_id: string;
  person_type: PersonType;
  title: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  track: Track;
  position_name: string;
  school_name: string;
  school_type: string;
  org_unit_id: string;
  org_unit_name: string;
  org_unit_code: string;
  started_on: string | null;
  order_no: string;
  subjects: string;
  status: StaffStatus;
  is_active: boolean;
  total_count: number;
};

export function educationTableParams(raw: Record<string, string | string[] | undefined> | URLSearchParams): TableParams {
  return parseTableParams(raw, {
    sortable: ["name", "school", "unit", "started"],
    defaultSort: "name",
    filters: ["unit", "school", "status"],
    pageSize: 10,
  });
}

export async function queryEducationStaff(track: Track, params: TableParams, all = false) {
  const supabase = await createClient();
  const status = params.filters.status;
  const { data, error } = await supabase.rpc("list_education_staff", {
    p_track: track,
    p_q: params.q,
    p_unit: isUuid(params.filters.unit ?? "") ? params.filters.unit : null,
    p_school: params.filters.school || null,
    p_status: status === "inactive" || (STAFF_STATUSES as readonly string[]).includes(status) ? status : null,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: all ? 10000 : params.pageSize,
    p_offset: all ? 0 : params.from,
  });
  const rows = (data as EducationRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error };
}

export type UnitCount = {
  org_unit_id: string;
  org_unit_name: string;
  org_unit_code: string;
  level: OrgLevel;
  staff_count: number;
};

/** จำนวน จศป. ที่ปฏิบัติหน้าที่อยู่ ต่อเขตที่รับผิดชอบ */
export async function fetchEducationCounts(track: Track, unitId: string | null): Promise<UnitCount[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("education_staff_counts", {
    p_track: track,
    p_unit: unitId && isUuid(unitId) ? unitId : null,
  });
  return ((data as UnitCount[] | null) ?? []).map((c) => ({ ...c, staff_count: Number(c.staff_count) }));
}

export async function fetchEducationSchools(track: Track): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("education_schools", { p_track: track });
  return ((data as { school_name: string }[] | null) ?? []).map((s) => s.school_name);
}
