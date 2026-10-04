import "server-only";

import type { AuthContext } from "@/lib/auth/session";
import { parseTableParams, type TableParams } from "@/lib/data-table";
import {
  PERSON_COLUMNS,
  PERSON_STATUSES,
  type Appointment,
  type EndReason,
  type Person,
  type PersonStatus,
  type PersonType,
  type PositionType,
} from "@/lib/persons";
import { createClient } from "@/lib/supabase/server";

/** บทบาทที่เพิ่มและแก้ไขทะเบียนบุคคลได้ (สิทธิ์จริงตรวจที่ฐานข้อมูลตามเขตปกครองอีกชั้น) */
export function isPersonnelEditor(ctx: AuthContext): boolean {
  return ctx.roles.some((r) => r.effective && (r.role_key === "admin" || r.role_key === "secretary"));
}

export async function fetchPositionTypes(): Promise<PositionType[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("position_types")
    .select("key, name, kind, level, max_per_unit, sort_order, is_active")
    .order("sort_order");
  return (data as PositionType[] | null) ?? [];
}

// ------------------------------------------------------------------
// รายชื่อบุคลากร (ตารางข้อมูลกลาง) ใช้ร่วมกันทั้งหน้าจอและการส่งออก Excel
// ------------------------------------------------------------------

export type PersonnelRow = {
  id: string;
  person_type: PersonType;
  title: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  temple_name: string;
  org_unit_id: string;
  org_unit_name: string;
  org_unit_code: string;
  ordination_date: string | null;
  status: PersonStatus;
  is_active: boolean;
  positions: string | null;
  total_count: number;
};

export function personnelTableParams(raw: Record<string, string | string[] | undefined> | URLSearchParams): TableParams {
  return parseTableParams(raw, {
    sortable: ["name", "unit", "ordination", "status"],
    defaultSort: "name",
    filters: ["unit", "position", "status"],
    pageSize: 10,
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

export async function queryPersonnel(params: TableParams, all = false) {
  const supabase = await createClient();
  const status = params.filters.status;
  const { data, error } = await supabase.rpc("list_personnel", {
    p_q: params.q,
    p_unit: isUuid(params.filters.unit ?? "") ? params.filters.unit : null,
    p_position: /^[a-z_]+$/.test(params.filters.position ?? "") ? params.filters.position : null,
    p_status: status === "inactive" || (PERSON_STATUSES as readonly string[]).includes(status) ? status : null,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: all ? 10000 : params.pageSize,
    p_offset: all ? 0 : params.from,
  });
  const rows = (data as PersonnelRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error };
}

// ------------------------------------------------------------------
// ประวัติรายบุคคล
// ------------------------------------------------------------------

export type PersonDetail = Person & { org_unit_name: string; org_unit_code: string };

/** คืน null ถ้าไม่พบ หรือ RLS ไม่ให้เห็นบุคคลนี้ */
export async function fetchPerson(id: string): Promise<PersonDetail | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("persons")
    .select(`${PERSON_COLUMNS}, org_units(name, code)`)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const { org_units, ...person } = data as unknown as Person & { org_units: { name: string; code: string } | null };
  return { ...person, org_unit_name: org_units?.name ?? "", org_unit_code: org_units?.code ?? "" };
}

export async function fetchAppointments(personId: string): Promise<Appointment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select(
      "id, person_id, position_type_key, org_unit_id, appointed_on, order_no, ended_on, end_reason, end_note, is_active, position_types(name), org_units(name)",
    )
    .eq("person_id", personId)
    .order("appointed_on", { ascending: false })
    .order("created_at", { ascending: false });
  type Row = Omit<Appointment, "position_name" | "org_unit_name" | "end_reason"> & {
    end_reason: EndReason | null;
    position_types: { name: string } | null;
    org_units: { name: string } | null;
  };
  return ((data as unknown as Row[] | null) ?? []).map(({ position_types, org_units, ...a }) => ({
    ...a,
    position_name: position_types?.name ?? a.position_type_key,
    org_unit_name: org_units?.name ?? "",
  }));
}

/** เขตปกครองใดบ้าง (จากรายการที่ส่งมา) ที่ผู้ใช้ปัจจุบันแก้ไขทะเบียนบุคคลได้ */
export async function editableUnits(unitIds: string[]): Promise<Set<string>> {
  const supabase = await createClient();
  const unique = [...new Set(unitIds)];
  const results = await Promise.all(
    unique.map(async (id) => {
      const { data } = await supabase.rpc("can_edit_personnel", { p_org_unit_id: id });
      return data === true ? id : null;
    }),
  );
  return new Set(results.filter((id): id is string => id !== null));
}

export type HistoryLog = {
  id: number;
  action: string;
  table_name: string;
  row_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
};

export async function fetchPersonnelHistory(personId: string): Promise<HistoryLog[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("personnel_history", { p_person_id: personId });
  return (data as HistoryLog[] | null) ?? [];
}

/** ลิงก์ชั่วคราว (5 นาที) ของรูปถ่ายล่าสุดของบุคคล คืน null ถ้ายังไม่มีรูป */
export async function fetchPersonPhotoUrl(personId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("entity_table", "person_photos")
    .eq("entity_id", personId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return null;
  const { data } = await supabase.storage.from("attachments").createSignedUrl(row.storage_path, 300);
  return data?.signedUrl ?? null;
}
