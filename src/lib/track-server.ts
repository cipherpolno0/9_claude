import "server-only";

import { unstable_cache } from "next/cache";

import { isPlaceRequestType } from "@/lib/place-requests";
import { PUBLIC_CACHE_SECONDS } from "@/lib/registry";
import { createPublicClient } from "@/lib/supabase/public";

import { TRACK_PAGE_SIZE, TRACK_TAG, type PublicRequestRow, type PublicRequestStatus, type PublicSummaryRow } from "./track";

/**
 * ข้อมูลของหน้าติดตามคำขอ อ่านด้วยบทบาท anon ผ่านฟังก์ชัน public_... เท่านั้น
 * ตารางสรุปและรายการปีถูกแคช 5 นาที และถูกล้างทันทีเมื่อมีการยื่นหรือพิจารณาคำขอในพื้นที่ทำงาน
 */
const cacheOptions = { revalidate: PUBLIC_CACHE_SECONDS, tags: [TRACK_TAG] };

/** ปี พ.ศ. ปัจจุบันตามเวลาประเทศไทย (ตรงกับ current_year_be() ในฐานข้อมูล) */
export function currentYearBe(): number {
  return Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 4)) + 543;
}

/** ตารางสรุป: จำนวนคำขอของระบบที่ 4 ของปี พ.ศ. ที่ยื่น แยกตามภาค ชนิดคำขอ และสถานะ */
export const fetchPublicRequestSummary = unstable_cache(
  async (year: number): Promise<PublicSummaryRow[]> => {
    const { data } = await createPublicClient().rpc("public_request_summary", { p_year: year });
    return ((data as PublicSummaryRow[] | null) ?? []).map((r) => ({ ...r, total: Number(r.total) }));
  },
  ["track-summary"],
  cacheOptions,
);

/** ปี พ.ศ. ที่มีคำขอ (รวมปีปัจจุบันเสมอ) เรียงจากปีล่าสุด */
export const fetchPublicRequestYears = unstable_cache(
  async (): Promise<number[]> => {
    const { data } = await createPublicClient().rpc("public_request_years");
    const years = ((data as { year_be: number }[] | null) ?? []).map((r) => Number(r.year_be));
    return years.length > 0 ? years : [currentYearBe()];
  },
  ["track-years"],
  cacheOptions,
);

export type TrackFilters = { type: string | null; province: number | null; year: number | null };

/** รายการคำขอตามตัวกรอง ครั้งละ 1 หน้า (ไม่แคช) */
export async function queryPublicRequests(filters: TrackFilters, page: number) {
  const { data, error } = await createPublicClient().rpc("public_requests", {
    p_type: isPlaceRequestType(filters.type) ? filters.type : null,
    p_province: filters.province,
    p_year: filters.year,
    p_limit: TRACK_PAGE_SIZE,
    p_offset: (Math.max(1, page) - 1) * TRACK_PAGE_SIZE,
  });
  const rows = (data as PublicRequestRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0), failed: Boolean(error) };
}

/** สถานะของคำขอ 1 รายการจากเลขที่คำขอ (คืน null ถ้าไม่พบ หรือเป็นคำขอที่ไม่เปิดเผย) */
export async function fetchPublicRequestStatus(requestNo: string): Promise<PublicRequestStatus | null> {
  const no = requestNo.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}-\d{4}-\d{1,6}$/.test(no)) return null;
  const { data } = await createPublicClient().rpc("public_request_status", { p_request_no: no });
  return (data as PublicRequestStatus | null) ?? null;
}
