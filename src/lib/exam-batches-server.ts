import "server-only";

import {
  BATCH_PAGE_SIZE,
  CANDIDATE_COLUMNS,
  type BatchDetail,
  type BatchListItem,
  type BatchStatus,
  type CandidateRow,
} from "@/lib/exam-batches";
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

export type CandidateFilter = "all" | "error" | "ok";

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
    .order("row_no")
    .range((page - 1) * BATCH_PAGE_SIZE, page * BATCH_PAGE_SIZE - 1);
  if (filter === "error") query = query.in("status", ["error", "excluded"]);
  if (filter === "ok") query = query.eq("status", "ok");
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
      .order("row_no")
      .range(from, from + 999);
    const chunk = (data as CandidateRow[] | null) ?? [];
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return rows;
}
