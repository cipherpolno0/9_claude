import "server-only";

import { parseTableParams, type TableParams } from "@/lib/data-table";
import { isUuid } from "@/lib/persons-server";
import { placeAddress, type PlaceAddressParts, type PlaceType } from "@/lib/places";
import type { ReportTable } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import {
  VENUE_STATUSES,
  VENUE_TYPE_LABEL,
  isVenueType,
  venueLevelsText,
  type AcademicYear,
  type OfficerRole,
  type VenueStatus,
  type VenueType,
} from "@/lib/venues";

// ------------------------------------------------------------------
// ปีการศึกษา
// ------------------------------------------------------------------

export async function fetchAcademicYears(): Promise<AcademicYear[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("academic_years")
    .select("id, year_be, starts_on, ends_on, is_current, request_deadline")
    .order("year_be", { ascending: false });
  return (data as AcademicYear[] | null) ?? [];
}

/** ปีการศึกษาที่เลือกจากที่อยู่หน้าเว็บ (?year=พ.ศ.) ถ้าไม่ได้เลือก ใช้ปีปัจจุบัน หรือปีล่าสุด */
export function pickYear(years: AcademicYear[], raw: string | undefined | null): AcademicYear | null {
  const wanted = Number(raw);
  return years.find((y) => y.year_be === wanted) ?? years.find((y) => y.is_current) ?? years[0] ?? null;
}

// ------------------------------------------------------------------
// รายการสนามสอบ
// ------------------------------------------------------------------

export type VenueRow = {
  id: string;
  code: string;
  name: string;
  venue_type: VenueType;
  levels: string[];
  capacity: number | null;
  status: VenueStatus;
  moved_to_venue_id: string | null;
  moved_to_name: string | null;
  start_year_be: number | null;
  is_active: boolean;
  place_id: string;
  place_name: string;
  district_name: string | null;
  district_prefix: string | null;
  province_name: string | null;
  org_unit_id: string;
  org_unit_name: string;
  org_unit_code: string;
  chair_name: string | null;
  chair_status: string | null;
  chair_person_type: string | null;
  chair_phone: string | null;
  receiver_name: string | null;
  receiver_status: string | null;
  receiver_person_type: string | null;
  receiver_phone: string | null;
  missing_chair: boolean;
  missing_receiver: boolean;
  total_count: number;
};

export const VENUE_ALERTS = ["missing", "changed"] as const;

export function venuesTableParams(raw: Record<string, string | string[] | undefined> | URLSearchParams): TableParams {
  return parseTableParams(raw, {
    sortable: ["name", "code", "unit", "status"],
    defaultSort: "name",
    filters: ["unit", "type", "province", "status", "alert"],
    pageSize: 10,
  });
}

export async function queryVenues(yearId: string, params: TableParams) {
  const supabase = await createClient();
  const { unit, type, province, status, alert } = params.filters;
  const { data, error } = await supabase.rpc("list_venues", {
    p_year: yearId,
    p_type: isVenueType(type) ? type : null,
    p_q: params.q,
    p_unit: isUuid(unit ?? "") ? unit : null,
    p_province: /^\d{2}$/.test(province ?? "") ? Number(province) : null,
    p_status: status === "inactive" || (VENUE_STATUSES as readonly string[]).includes(status) ? status : null,
    p_alert: (VENUE_ALERTS as readonly string[]).includes(alert) ? alert : null,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: params.pageSize,
    p_offset: params.from,
  });
  const rows = (data as VenueRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error };
}

export type VenueAlerts = { open_total: number; missing_chair: number; missing_receiver: number; status_changed: number };

export async function fetchVenueAlerts(yearId: string, unitId: string | null, type: string | null): Promise<VenueAlerts> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("venue_alerts", {
    p_year: yearId,
    p_unit: unitId && isUuid(unitId) ? unitId : null,
    p_type: isVenueType(type) ? type : null,
  });
  const row = (data as VenueAlerts[] | null)?.[0];
  return {
    open_total: Number(row?.open_total ?? 0),
    missing_chair: Number(row?.missing_chair ?? 0),
    missing_receiver: Number(row?.missing_receiver ?? 0),
    status_changed: Number(row?.status_changed ?? 0),
  };
}

// ------------------------------------------------------------------
// รายละเอียดสนามสอบ
// ------------------------------------------------------------------

export type VenueDetail = PlaceAddressParts & {
  id: string;
  code: string;
  name: string;
  venue_type: VenueType;
  levels: string[];
  capacity: number | null;
  status: VenueStatus;
  moved_to_venue_id: string | null;
  moved_to_name: string | null;
  moved_to_code: string | null;
  start_year_be: number | null;
  note: string;
  is_active: boolean;
  place_id: string;
  place_name: string;
  place_code: string;
  place_type: PlaceType;
  org_unit_id: string;
  org_unit_name: string;
  can_edit: boolean;
};

/** คืน null ถ้าไม่พบ หรือผู้ใช้ไม่มีสิทธิ์ดูสนามสอบนี้ */
export async function fetchVenue(id: string): Promise<VenueDetail | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("venue_detail", { p_venue_id: id });
  return (data as VenueDetail[] | null)?.[0] ?? null;
}

export type VenueOfficer = {
  id: string;
  academic_year_id: string;
  year_be: number;
  role: OfficerRole;
  person_id: string;
  person_name: string;
  person_status: string;
  person_type: string;
  person_unit_name: string;
  delivery_address: string;
  contact_phone: string;
  is_public: boolean;
  is_phone_public: boolean;
  note: string;
};

export async function fetchVenueOfficers(venueId: string): Promise<VenueOfficer[]> {
  const supabase = await createClient();
  // venue_officer_rows คืนชื่อบุคคล (ผู้ดูสนามสอบอาจไม่มีสิทธิ์ดูทะเบียนบุคคล) ส่วนความยินยอมเผยแพร่เบอร์อ่านจากตารางโดยตรงใต้ RLS
  const [rows, flags] = await Promise.all([
    supabase.rpc("venue_officer_rows", { p_venue_id: venueId }),
    supabase.from("venue_officers").select("id, is_phone_public").eq("venue_id", venueId).eq("is_active", true),
  ]);
  const phone = new Map(((flags.data as { id: string; is_phone_public: boolean }[] | null) ?? []).map((f) => [f.id, f.is_phone_public]));
  return ((rows.data as Omit<VenueOfficer, "is_phone_public">[] | null) ?? []).map((o) => ({
    ...o,
    is_phone_public: phone.get(o.id) ?? false,
  }));
}

export type VenueHistoryLog = {
  id: number;
  action: string;
  table_name: string;
  row_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
};

export async function fetchVenueHistory(venueId: string): Promise<VenueHistoryLog[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("venue_history", { p_venue_id: venueId });
  return (data as VenueHistoryLog[] | null) ?? [];
}

// ------------------------------------------------------------------
// รายงาน: บัญชีสนามสอบ แยกตามจังหวัด
// ------------------------------------------------------------------

type ReportRow = Omit<PlaceAddressParts, "province_name"> & {
  province_name: string;
  code: string;
  name: string;
  venue_type: VenueType;
  levels: string[];
  capacity: number | null;
  place_name: string;
  org_unit_name: string;
  chair_name: string | null;
  chair_phone: string | null;
  chair_address: string | null;
  receiver_name: string | null;
  receiver_phone: string | null;
  receiver_address: string | null;
};

/** ตารางรายงานชุดเดียว ใช้ทั้งแสดงบนจอ ส่งออก Excel และหน้าพิมพ์ */
export async function buildVenueReport(
  year: AcademicYear,
  unit: { id: string; name: string } | null,
  type: VenueType | null,
): Promise<ReportTable> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_venues", { p_year: year.id, p_unit: unit?.id ?? null, p_type: type });
  if (error) throw error;
  const rows = (data as ReportRow[] | null) ?? [];
  return {
    kind: "venues",
    title: `บัญชีสนามสอบ${type ? VENUE_TYPE_LABEL[type] : ""} ปีการศึกษา ${year.year_be}`,
    subtitle: `${unit ? unit.name : "ทุกเขตที่ท่านดูแล"} · เฉพาะสนามสอบที่เปิดอยู่ แยกตามจังหวัดของสถานที่ตั้ง`,
    note: "ที่อยู่จัดส่งและเบอร์ติดต่อเป็นข้อมูลภายใน ห้ามเผยแพร่ต่อสาธารณะ",
    groupColumn: 0,
    columns: [
      { header: "จังหวัด", width: 18 },
      { header: "รหัส", width: 12 },
      { header: "สนามสอบ", width: 30 },
      { header: "ประเภท", width: 12 },
      { header: "ชั้นที่เปิดสอบ", width: 20 },
      { header: "ความจุ", width: 10, align: "right" },
      { header: "ที่ตั้ง", width: 44 },
      { header: "ประธานสนามสอบ", width: 28 },
      { header: "เบอร์ประธาน", width: 16 },
      { header: "ผู้รับข้อสอบ", width: 28 },
      { header: "เบอร์ผู้รับข้อสอบ", width: 16 },
      { header: "ที่อยู่จัดส่งข้อสอบ", width: 44 },
    ],
    rows: rows.map((r) => [
      r.province_name,
      r.code,
      r.name,
      VENUE_TYPE_LABEL[r.venue_type] ?? r.venue_type,
      venueLevelsText(r.levels),
      r.capacity ?? "",
      [r.place_name, placeAddress({ ...r, province_name: null })].filter(Boolean).join(" "),
      r.chair_name ?? "(ยังไม่มี)",
      r.chair_phone ?? "",
      r.receiver_name ?? "(ยังไม่มี)",
      r.receiver_phone ?? "",
      r.receiver_address || r.chair_address || "",
    ]),
  };
}

// ------------------------------------------------------------------
// ประวัติการเปิด ปิด ย้ายของสนามสอบ (บันทึกโดยระบบเมื่อคำขอได้รับอนุมัติ อยู่ใต้ RLS ตามสิทธิ์ดูสนามสอบ)
// ------------------------------------------------------------------

export type VenueChange = {
  id: string;
  change_type: "open" | "close" | "move";
  from_place_name: string;
  to_place_name: string;
  effective_year_be: number | null;
  reason: string;
  created_at: string;
  request_id: string | null;
  replacement: { id: string; name: string; code: string } | null;
};

export async function fetchVenueChanges(venueId: string): Promise<VenueChange[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("exam_venue_changes")
    .select(
      "id, change_type, from_place_name, to_place_name, effective_year_be, reason, created_at, request_id, replacement:replacement_venue_id(id, name, code)",
    )
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false });
  return (data as unknown as VenueChange[] | null) ?? [];
}
