import "server-only";

import { createHmac } from "node:crypto";

import { unstable_cache } from "next/cache";
import { headers } from "next/headers";

import { explainError } from "@/lib/errors";
import { isExamLevel, isExamType, type ExamLevel, type ExamType } from "@/lib/exam-forms";
import {
  RESULTS_TAG,
  normalizeText,
  type PassHistoryRow,
  type PassListOption,
  type PassListRow,
  type PublicPasser,
  type PublicResultPlace,
  type PublicResultSearch,
  type PublicResultStatRow,
  type ResultForm,
  type ResultHistoryItem,
  type ResultRound,
  type ResultRow,
} from "@/lib/exam-results";
import { PUBLIC_CACHE_SECONDS } from "@/lib/registry";
import { createAdminClient, getSupabaseEnv } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

// ---------------------------------------------------------------
// ส่วนกลาง
// ---------------------------------------------------------------
export async function fetchResultRounds(): Promise<ResultRound[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("exam_result_rounds");
  return (data as ResultRound[] | null) ?? [];
}

export async function fetchResultRows(
  roundId: string,
  filter: { result?: string | null; q?: string; venue?: string | null; limit?: number; offset?: number },
): Promise<ResultRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("exam_result_rows", {
    p_round: roundId,
    p_result: filter.result ?? null,
    p_q: filter.q ?? "",
    p_venue: filter.venue ?? null,
    p_limit: filter.limit ?? 200,
    p_offset: filter.offset ?? 0,
  });
  if (error) throw new Error(explainError(error));
  return (data as ResultRow[] | null) ?? [];
}

export async function fetchResultHistory(roundId: string, candidateId: string | null = null): Promise<ResultHistoryItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("exam_result_history", { p_round: roundId, p_candidate: candidateId });
  return (data as ResultHistoryItem[] | null) ?? [];
}

export async function fetchPassHistory(q: string, active: boolean, offset: number): Promise<PassHistoryRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_pass_history", { p_q: q, p_active: active, p_limit: 200, p_offset: offset });
  return (data as PassHistoryRow[] | null) ?? [];
}

/** แบบบัญชีผู้สอบได้ (ศ.๔ ศ.๘) ทุกประเภท */
export async function fetchResultForms(): Promise<ResultForm[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("exam_result_forms").select("exam_type, code, certify_text, signatures").order("exam_type");
  return (data as ResultForm[] | null) ?? [];
}

// ---------------------------------------------------------------
// บัญชีผู้สอบได้ (ผู้เห็นบัญชี เมื่อประกาศผลแล้ว / ส่วนกลางทุกเวลา)
// ---------------------------------------------------------------
export async function fetchPassListOptions(roundId: string, unitId: string | null): Promise<PassListOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("exam_pass_list_options", { p_round: roundId, p_unit: unitId });
  return (data as PassListOption[] | null) ?? [];
}

export async function fetchPassList(
  roundId: string,
  unitId: string | null,
  placeId: string | null,
  venueId: string | null,
): Promise<PassListRow[]> {
  if (!placeId && !venueId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("exam_pass_list", {
    p_round: roundId,
    p_unit: unitId,
    p_place: placeId,
    p_venue: venueId,
  });
  if (error) throw new Error(explainError(error));
  return (data as PassListRow[] | null) ?? [];
}

// ---------------------------------------------------------------
// หน้าสาธารณะ (anon ผ่านฟังก์ชันที่คืนเฉพาะผู้สอบได้ของรอบที่ประกาศแล้ว แคช 5 นาที ล้างเมื่อประกาศหรือแก้ผล)
// ---------------------------------------------------------------
export const fetchPublicResultStats = unstable_cache(
  async (): Promise<PublicResultStatRow[]> => {
    const { data, error } = await createPublicClient().rpc("public_result_stats");
    if (error) throw new Error(error.message);
    return (data as PublicResultStatRow[] | null) ?? [];
  },
  ["public-result-stats"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [RESULTS_TAG] },
);

const validChoice = (year: number, type: string, level: string): type is ExamType =>
  Number.isInteger(year) && year >= 2500 && year <= 2700 && isExamType(type) && isExamLevel(level);

export const fetchPublicResultPlaces = unstable_cache(
  async (year: number, type: string, level: string): Promise<PublicResultPlace[]> => {
    if (!validChoice(year, type, level)) return [];
    const { data, error } = await createPublicClient().rpc("public_result_places", { p_year: year, p_type: type, p_level: level });
    if (error) throw new Error(error.message);
    return (data as PublicResultPlace[] | null) ?? [];
  },
  ["public-result-places"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [RESULTS_TAG] },
);

export const fetchPublicResultList = unstable_cache(
  async (year: number, type: string, level: string, place: string): Promise<PublicPasser[]> => {
    if (!validChoice(year, type, level) || !isUuid(place)) return [];
    const { data, error } = await createPublicClient().rpc("public_result_list", {
      p_year: year,
      p_type: type,
      p_level: level,
      p_place: place,
    });
    if (error) throw new Error(error.message);
    return (data as PublicPasser[] | null) ?? [];
  },
  ["public-result-list"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [RESULTS_TAG] },
);

/** รหัสเครื่องผู้ค้น: ที่อยู่ IP เข้ารหัสทางเดียวด้วยกุญแจลับของเว็บ (ฐานข้อมูลไม่เห็นที่อยู่จริง) แบบเดียวกับบทที่ 20 */
async function clientHash(secret: string): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || "unknown";
  return createHmac("sha256", secret).update(`public-check|${ip}`).digest("hex");
}

/**
 * ค้นผลสอบด้วยชื่อ เหตุผลที่ใช้ createAdminClient (กุญแจลับ): ฟังก์ชัน public_result_search นับจำนวนครั้งต่อนาที
 * ต่อเครื่องในฐานข้อมูล ถ้าเปิดให้ anon เรียกตรง ผู้เรียก API จะส่งรหัสเครื่องปลอมเลี่ยงการจำกัดได้ (เหตุผลเดียวกับบทที่ 20)
 */
export async function searchPublicResults(input: {
  first: string;
  last: string;
  year: number;
  type: string;
  level: string;
}): Promise<PublicResultSearch> {
  const first = normalizeText(input.first);
  const last = normalizeText(input.last);
  if (!validChoice(input.year, input.type, input.level)) return { ok: false, error: "กรุณาเลือกปี ประเภท และชั้น" };
  if (first.length < 2 || first.length > 100 || (last && last.length < 2) || last.length > 100) {
    return { ok: false, error: "กรุณากรอกชื่อ (และนามสกุลหรือฉายาถ้ามี) อย่างน้อย 2 ตัวอักษร" };
  }
  const { secretKey, missing } = getSupabaseEnv();
  if (missing.length) return { ok: false, error: "ระบบค้นหายังไม่พร้อมใช้งาน" };
  const { data, error } = await createAdminClient().rpc("public_result_search", {
    p_first: first,
    p_last: last,
    p_year: input.year,
    p_type: input.type as ExamType,
    p_level: input.level as ExamLevel,
    p_client: await clientHash(secretKey),
  });
  if (error) return { ok: false, error: explainError(error) };
  const value = (data ?? {}) as { limited?: boolean; total?: number; rows?: PublicPasser[] };
  if (value.limited) return { ok: false, limited: true, error: "ค้นบ่อยเกินไป (เกิน 10 ครั้งต่อนาที) กรุณารอสักครู่แล้วค้นใหม่" };
  return { ok: true, total: value.total ?? 0, rows: value.rows ?? [] };
}
