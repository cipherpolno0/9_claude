import "server-only";

import { parseTableParams, type TableParams } from "@/lib/data-table";
import { REQUEST_STATUS_LABEL } from "@/lib/requests/labels";
import { createClient } from "@/lib/supabase/server";

import {
  isPlaceRequestType,
  type PlaceRequestRow,
  type RequestDocument,
  type RequestDocumentType,
} from "./place-requests";

export const REQUEST_TABS = ["mine", "pending", "area"] as const;
export type RequestTab = (typeof REQUEST_TABS)[number];
export const isRequestTab = (value: unknown): value is RequestTab =>
  typeof value === "string" && (REQUEST_TABS as readonly string[]).includes(value);

export function placeRequestParams(raw: Record<string, string | string[] | undefined> | URLSearchParams): TableParams {
  return parseTableParams(raw, {
    sortable: ["submitted", "no", "status", "due"],
    defaultSort: "submitted",
    defaultDir: "desc",
    filters: ["type", "status"],
    pageSize: 10,
  });
}

/** รายการคำขอจัดตั้งและยุบสำนัก ตามแท็บ (ทำงานในนามผู้ใช้ เห็นเฉพาะคำขอที่ RLS อนุญาต) */
export async function queryPlaceRequests(tab: RequestTab, params: TableParams) {
  const supabase = await createClient();
  const { type, status } = params.filters;
  const { data, error } = await supabase.rpc("list_place_requests", {
    p_tab: tab,
    p_type: isPlaceRequestType(type) ? type : null,
    p_status: status in REQUEST_STATUS_LABEL ? status : null,
    p_q: params.q,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: params.pageSize,
    p_offset: params.from,
  });
  const rows = (data as PlaceRequestRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error };
}

export type PlaceRequestCounts = { mine: number; pending: number; area: number; pending_overdue: number };

export async function fetchPlaceRequestCounts(): Promise<PlaceRequestCounts> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("place_request_counts");
  const row = ((data as PlaceRequestCounts[] | null) ?? [])[0];
  return {
    mine: Number(row?.mine ?? 0),
    pending: Number(row?.pending ?? 0),
    area: Number(row?.area ?? 0),
    pending_overdue: Number(row?.pending_overdue ?? 0),
  };
}

/** เอกสารตามรายการของคำขอ พร้อมจำนวนไฟล์ที่แนบแล้ว */
export async function fetchRequestDocuments(requestId: string): Promise<RequestDocument[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("request_documents", { p_request_id: requestId });
  return (data as RequestDocument[] | null) ?? [];
}

/** รายการเอกสารที่ผู้ดูแลระบบตั้งไว้ (typeKey ว่าง = ทุกชนิดคำขอ) */
export async function fetchDocumentTypes(typeKey?: string, activeOnly = false): Promise<RequestDocumentType[]> {
  const supabase = await createClient();
  let query = supabase
    .from("request_document_types")
    .select("id, type_key, name, is_required, sort_order, is_active")
    .order("sort_order")
    .order("name");
  if (typeKey) query = query.eq("type_key", typeKey);
  if (activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return (data as RequestDocumentType[] | null) ?? [];
}

/**
 * แจ้งเตือนผู้พิจารณาของขั้นที่เกินกำหนด (ฐานข้อมูลกันไม่ให้แจ้งเกินวันละ 1 ครั้งต่อขั้น)
 * เรียกเมื่อเปิดแดชบอร์ดหรือหน้า คำขอ ถ้าผิดพลาดไม่กระทบการแสดงหน้า
 */
export async function remindOverduePlaceRequests(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("remind_overdue_place_requests");
  } catch {
    // ไม่ต้องทำอะไร: เป็นงานเสริม
  }
}
