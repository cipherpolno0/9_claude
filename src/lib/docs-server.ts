import "server-only";

import type { TableParams } from "@/lib/data-table";
import { createClient } from "@/lib/supabase/server";

import {
  isDocKind,
  isDocUrgency,
  type DocDetail,
  type DocRow,
  type DocsUnit,
  type DocTab,
  type IncomingDoc,
  type Letterhead,
} from "./docs";

/** ตัวอ่านข้อมูลสารบรรณ (ทำงานในนามผู้ใช้ ฐานข้อมูลตรวจสิทธิ์และชั้นความลับเอง) */

export async function fetchDocsUnits(): Promise<DocsUnit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("docs_units");
  if (error) return [];
  return (data as DocsUnit[] | null) ?? [];
}

export async function queryDocuments(unitId: string, tab: DocTab, year: number, params: TableParams) {
  const supabase = await createClient();
  const { kind, urgency, status } = params.filters;
  const { data, error } = await supabase.rpc("document_rows", {
    p_unit: unitId,
    p_tab: tab,
    p_year: year,
    p_kind: isDocKind(kind) ? kind : null,
    p_urgency: isDocUrgency(urgency) ? urgency : null,
    p_status: status && /^[a-z]+$/.test(status) ? status : null,
    p_q: params.q,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: params.pageSize,
    p_offset: params.from,
  });
  const rows = (data as DocRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error };
}

export async function fetchDocumentYears(unitId: string): Promise<number[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("document_years", { p_unit: unitId });
  return ((data as number[] | null) ?? []).map(Number);
}

export async function fetchIncoming(unitId: string): Promise<IncomingDoc[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("incoming_documents", { p_unit: unitId });
  if (error) return [];
  return (data as IncomingDoc[] | null) ?? [];
}

export async function fetchDocumentDetail(id: string): Promise<DocDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("document_detail", { p_id: id });
  if (error) return null;
  return (data as DocDetail | null) ?? null;
}

export async function fetchViewerCandidates(unitId: string): Promise<{ user_id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doc_viewer_candidates", { p_unit: unitId });
  if (error) return [];
  return (data as { user_id: string; name: string }[] | null) ?? [];
}

export async function fetchLetterhead(unitId: string): Promise<Letterhead | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("doc_unit_settings")
    .select("code_prefix, agency_name, address")
    .eq("org_unit_id", unitId)
    .maybeSingle();
  return (data as Letterhead | null) ?? null;
}

/** ตราของหน่วย: รูปล่าสุดที่แนบ (ลิงก์ชั่วคราว 5 นาที) */
export async function fetchEmblemUrl(unitId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("entity_table", "doc_unit_settings")
    .eq("entity_id", unitId)
    .eq("is_active", true)
    .like("mime_type", "image/%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const { data: signed } = await supabase.storage.from("attachments").createSignedUrl((data as { storage_path: string }).storage_path, 300);
  return signed?.signedUrl ?? null;
}
