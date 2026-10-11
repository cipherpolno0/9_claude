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
  type InboxItem,
  type RouteCandidate,
  type TaskRow,
  type ArchiveRow,
  type DocSearch,
  type DurationRow,
  type LinkCandidate,
  type PendingRow,
  type RegisterRow,
  type RequestDocLinks,
  type RetentionRule,
  type SearchRow,
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

// ---------------------------------------------------------------
// บทที่ 28: กล่องหนังสือเข้า งาน เส้นทาง
// ---------------------------------------------------------------
export async function fetchInbox(): Promise<InboxItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("docs_inbox");
  if (error) return [];
  return (data as InboxItem[] | null) ?? [];
}

export async function fetchDocsCounts(): Promise<{ inbox: number; tasks: number }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("docs_counts");
  const row = ((data as { inbox: number; tasks: number }[] | null) ?? [])[0];
  return { inbox: Number(row?.inbox ?? 0), tasks: Number(row?.tasks ?? 0) };
}

export async function fetchTasks(tab: "mine" | "ordered"): Promise<TaskRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("docs_tasks", { p_tab: tab });
  if (error) return [];
  return (data as TaskRow[] | null) ?? [];
}

export async function fetchRouteCandidates(docId: string, kind: "commanders" | "members"): Promise<RouteCandidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doc_route_candidates", { p_doc: docId, p_kind: kind });
  if (error) return [];
  return (data as RouteCandidate[] | null) ?? [];
}

/** บันทึกเวลาเปิดอ่าน (เส้นทางที่ถึงผู้ใช้หรือหน่วยของผู้ใช้) เรียกเมื่อเปิดหน้าหนังสือ */
export async function markDocumentRead(docId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("mark_document_read", { p_doc: docId });
}

/** แจ้งเตือนใกล้กำหนดและเกินกำหนด (ครั้งเดียวต่อขั้น) เรียกเมื่อเปิดกล่องหนังสือเข้าหรือหน้างาน */
export async function remindDocsDue(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("remind_docs_due");
}

// ---------------------------------------------------------------
// บทที่ 29: คลังเก็บ ค้นหา อ้างอิงคำขอ รายงาน อายุการเก็บ
// ---------------------------------------------------------------
export async function queryArchive(unitId: string, params: TableParams) {
  const supabase = await createClient();
  const { kind, dir, expired } = params.filters;
  const { data, error } = await supabase.rpc("document_archive_rows", {
    p_unit: unitId,
    p_kind: isDocKind(kind) ? kind : null,
    p_direction: dir === "receive" || dir === "send" ? dir : null,
    p_expired: expired === "1",
    p_q: params.q,
    p_sort: params.sort,
    p_dir: params.dir,
    p_limit: params.pageSize,
    p_offset: params.from,
  });
  const rows = (data as ArchiveRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error };
}

const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function searchDocuments(s: DocSearch, page: number, pageSize: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("docs_search", {
    p_unit: /^[0-9a-f-]{36}$/i.test(s.unit) ? s.unit : null,
    p_doc_no: s.no || null,
    p_subject: s.subject || null,
    p_from: s.from || null,
    p_to: s.to || null,
    p_date_from: isoDate(s.df),
    p_date_to: isoDate(s.dt),
    p_kind: isDocKind(s.kind) ? s.kind : null,
    p_urgency: isDocUrgency(s.urgency) ? s.urgency : null,
    p_direction: s.dir === "receive" || s.dir === "send" ? s.dir : null,
    p_body: s.body || null,
    p_archive: s.archive,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  const rows = (data as SearchRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error };
}

export async function fetchRequestDocLinks(requestId: string): Promise<RequestDocLinks | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_document_links", { p_request: requestId });
  if (error) return null;
  return (data as RequestDocLinks | null) ?? null;
}

export async function fetchLinkCandidates(requestId: string, q: string): Promise<LinkCandidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("doc_link_candidates", { p_request: requestId, p_q: q });
  if (error) return [];
  return (data as LinkCandidate[] | null) ?? [];
}

export async function fetchRegisterReport(unitId: string, direction: "receive" | "send", yearBe: number, month: number): Promise<RegisterRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("docs_report_register", {
    p_unit: unitId,
    p_direction: direction,
    p_year: yearBe,
    p_month: month,
  });
  if (error) return [];
  return (data as RegisterRow[] | null) ?? [];
}

export async function fetchPendingReport(unitId: string): Promise<PendingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("docs_report_pending", { p_unit: unitId });
  if (error) return [];
  return (data as PendingRow[] | null) ?? [];
}

export async function fetchDurationReport(fiscalYear: number): Promise<DurationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("docs_report_duration", { p_fiscal_year: fiscalYear });
  if (error) return [];
  return ((data as DurationRow[] | null) ?? []).map((r) => ({
    ...r,
    avg_days: r.avg_days === null ? null : Number(r.avg_days),
    min_days: r.min_days === null ? null : Number(r.min_days),
    max_days: r.max_days === null ? null : Number(r.max_days),
    act_avg_days: r.act_avg_days === null ? null : Number(r.act_avg_days),
  }));
}

export async function fetchRetentionRules(): Promise<RetentionRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("doc_retention_rules").select("kind, years, note, updated_at");
  if (error) return [];
  return (data as RetentionRule[] | null) ?? [];
}
