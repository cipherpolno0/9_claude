import "server-only";

import { parseTableParams, type TableParams } from "@/lib/data-table";
import type { OrgUnit, Sect } from "@/lib/org-units";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";
import { REQUEST_STATUS_LABEL } from "@/lib/requests/labels";
import { PERSONNEL_REQUEST_TYPES, STATUS_TYPES, type OpenStatusRequest, type StatusChange } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";

/** เส้นเวลาสถานะของบุคคล (ใหม่สุดอยู่บน) */
export async function fetchStatusChanges(personId: string): Promise<StatusChange[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("status_changes")
    .select(
      "id, person_id, change_type, effective_on, reason, request_id, from_place, to_place, status_before, status_after, created_at, " +
        "from_unit:org_units!status_changes_from_org_unit_id_fkey(name), to_unit:org_units!status_changes_to_org_unit_id_fkey(name), requests(request_no)",
    )
    .eq("person_id", personId)
    .order("effective_on", { ascending: false })
    .order("created_at", { ascending: false });
  type Row = Omit<StatusChange, "request_no" | "from_unit_name" | "to_unit_name"> & {
    from_unit: { name: string } | null;
    to_unit: { name: string } | null;
    requests: { request_no: string } | null;
  };
  return ((data as unknown as Row[] | null) ?? []).map(({ from_unit, to_unit, requests, ...c }) => ({
    ...c,
    request_no: requests?.request_no ?? null,
    from_unit_name: from_unit?.name ?? null,
    to_unit_name: to_unit?.name ?? null,
  }));
}

/** คำขอหรือการแจ้งเรื่องสถานะของบุคคลนี้ที่ยังไม่ได้ผล (มีได้ครั้งละ 1 รายการ) */
export async function fetchOpenStatusRequest(personId: string): Promise<OpenStatusRequest | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("requests")
    .select("id, request_no, type_key, status")
    .in("type_key", [...STATUS_TYPES])
    .in("status", ["pending", "returned"])
    .eq("payload->>person_id", personId)
    .limit(1)
    .maybeSingle();
  return (data as OpenStatusRequest | null) ?? null;
}

/** เขตปกครองทั้งหมดของนิกายหนึ่ง สำหรับเลือกหน่วยปลายทางของคำขอย้าย (เขตปกครองเป็นข้อมูลอ้างอิงที่ทุกคนอ่านได้) */
export async function fetchUnitsOfSect(sect: Sect | null): Promise<AccessibleOrgUnit[]> {
  if (!sect) return [];
  const supabase = await createClient();
  const all: AccessibleOrgUnit[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("org_units")
      .select("id, parent_id, level, sect, name, code, is_active")
      .eq("sect", sect)
      .eq("is_active", true)
      .order("code")
      .range(from, from + 999);
    if (error) throw error;
    all.push(...((data as OrgUnit[]) ?? []).map((u) => ({ ...u, selectable: true })));
    if (!data || data.length < 1000) break;
  }
  return all;
}

// ------------------------------------------------------------------
// หน้ารายการคำขอและการแจ้งของทะเบียนบุคคล
// ------------------------------------------------------------------

export type PersonnelRequestRow = {
  id: string;
  request_no: string;
  type_key: string;
  type_name: string;
  title: string;
  status: keyof typeof REQUEST_STATUS_LABEL;
  person_id: string | null;
  person_name: string | null;
  org_unit_name: string;
  effective_on: string | null;
  submitted_at: string;
  decided_at: string | null;
  current_unit_name: string | null;
  total_count: number;
};

export function personnelRequestParams(raw: Record<string, string | string[] | undefined> | URLSearchParams): TableParams {
  return parseTableParams(raw, {
    sortable: ["submitted", "no", "status"],
    defaultSort: "submitted",
    defaultDir: "desc",
    filters: ["type", "status"],
    pageSize: 10,
  });
}

export async function queryPersonnelRequests(params: TableParams, all = false) {
  const supabase = await createClient();
  const { type, status } = params.filters;
  const { data, error } = await supabase.rpc("list_personnel_requests", {
    p_type: (PERSONNEL_REQUEST_TYPES as readonly string[]).includes(type) ? type : null,
    p_status: status in REQUEST_STATUS_LABEL ? status : null,
    p_q: params.q,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: all ? 10000 : params.pageSize,
    p_offset: all ? 0 : params.from,
  });
  const rows = (data as PersonnelRequestRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error };
}
