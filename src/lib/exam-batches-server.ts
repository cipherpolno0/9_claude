import "server-only";

import { unstable_cache } from "next/cache";

import {
  BATCH_PAGE_SIZE,
  CANDIDATE_COLUMNS,
  REGISTRATION_STATS_TAG,
  type AccountItem,
  type BatchDetail,
  type BatchListItem,
  type BatchScope,
  type BatchStatus,
  type CandidateRow,
  type HistoryItem,
  type PublicStatRow,
  type VenueTotalRow,
} from "@/lib/exam-batches";
import { PUBLIC_CACHE_SECONDS } from "@/lib/registry";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
/** เพดานที่ระบบรับได้ ไม่ว่าจะตั้งค่าไว้เท่าใด (ตรงกับขนาดสูงสุดของที่เก็บไฟล์ และ create_registration_batch) */
const HARD_MAX_MB = 10;
const HARD_MAX_ROWS = 5000;

/** ขนาดไฟล์และจำนวนแถวสูงสุดตามค่าตั้งระบบ (ผู้ดูแลระบบแก้ได้ในตาราง app_settings) */
export async function uploadLimits(): Promise<{ maxMb: number; maxRows: number }> {
  const supabase = await createClient();
  const [mb, rows] = await Promise.all([
    supabase.rpc("setting_int", { p_key: "exam_upload_max_mb" }),
    supabase.rpc("setting_int", { p_key: "exam_upload_max_rows" }),
  ]);
  const maxMb = Math.min(Math.max(Number(mb.data) || 5, 1), HARD_MAX_MB);
  const maxRows = Math.min(Math.max(Number(rows.data) || 2000, 1), HARD_MAX_ROWS);
  return { maxMb, maxRows };
}

/** ชุดรายชื่อที่ผู้ใช้เห็น (ผู้อัปโหลดเห็นของตน เจ้าคณะ/เลขานุการเห็นตามเขต ส่วนกลางเห็นทั้งหมด) */
export async function fetchBatches(status: BatchStatus | null): Promise<BatchListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_registration_batches", { p_status: status, p_limit: 300 });
  return (data as BatchListItem[] | null) ?? [];
}

export async function fetchBatch(id: string): Promise<BatchDetail | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_registration_batch", { p_id: id });
  return (data as BatchDetail | null) ?? null;
}

/** บัญชีตามขอบเขต: mine = ที่ตนอัปโหลด / area = ที่ส่งแล้วในเขต / all = ทุกบัญชีที่เห็น */
export async function fetchAccounts(scope: BatchScope, status: BatchStatus | null, round: string | null): Promise<AccountItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_registration_accounts", {
    p_scope: scope,
    p_status: status,
    p_round: round && UUID.test(round) ? round : null,
    p_limit: 500,
  });
  return (data as AccountItem[] | null) ?? [];
}

export async function fetchHistory(batchId: string): Promise<HistoryItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("registration_history", { p_batch: batchId });
  return (data as HistoryItem[] | null) ?? [];
}

export async function fetchCandidate(batchId: string, id: string): Promise<CandidateRow | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("candidates").select(CANDIDATE_COLUMNS).eq("batch_id", batchId).eq("id", id).maybeSingle();
  return (data as CandidateRow | null) ?? null;
}

/** ยอดผู้สมัครต่อสนามสอบของรอบ (ส่วนกลาง) */
export async function fetchVenueTotals(roundId: string): Promise<{ ok: true; rows: VenueTotalRow[] } | { ok: false; error: string }> {
  if (!UUID.test(roundId)) return { ok: true, rows: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("venue_registration_totals", { p_round: roundId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data as VenueTotalRow[] | null) ?? [] };
}

/** สถิติสมัครสอบสาธารณะ (ตัวเลขรวม ไม่มีรายบุคคล) แคช 5 นาที */
export const fetchPublicStats = unstable_cache(
  async (): Promise<PublicStatRow[]> => {
    const { data, error } = await createPublicClient().rpc("public_registration_stats");
    if (error) throw new Error(error.message);
    return (data as PublicStatRow[] | null) ?? [];
  },
  ["public-registration-stats"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [REGISTRATION_STATS_TAG] },
);

export type CandidateFilter = "all" | "error" | "ok" | "withdrawn";

/** รายชื่อในชุดทีละหน้า (แถวผิดคือ error และ excluded) */
export async function fetchCandidates(
  batchId: string,
  filter: CandidateFilter,
  page: number,
): Promise<{ rows: CandidateRow[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from("candidates")
    .select(CANDIDATE_COLUMNS, { count: "exact" })
    .eq("batch_id", batchId)
    .order("file_no")
    .order("row_no")
    .range((page - 1) * BATCH_PAGE_SIZE, page * BATCH_PAGE_SIZE - 1);
  if (filter === "error") query = query.in("status", ["error", "excluded"]);
  if (filter === "ok") query = query.eq("status", "ok");
  if (filter === "withdrawn") query = query.eq("status", "withdrawn");
  const { data, count } = await query;
  return { rows: (data as CandidateRow[] | null) ?? [], total: count ?? 0 };
}

/** แถวที่ไม่ผ่านทั้งหมด (สำหรับไฟล์รายการข้อผิดพลาด) */
export async function fetchErrorCandidates(batchId: string): Promise<CandidateRow[]> {
  const supabase = await createClient();
  const rows: CandidateRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("candidates")
      .select(CANDIDATE_COLUMNS)
      .eq("batch_id", batchId)
      .in("status", ["error", "excluded"])
      .order("file_no")
      .order("row_no")
      .range(from, from + 999);
    const chunk = (data as CandidateRow[] | null) ?? [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}
