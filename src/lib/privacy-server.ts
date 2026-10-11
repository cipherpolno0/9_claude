import "server-only";

import { unstable_cache } from "next/cache";

import { PUBLIC_CACHE_SECONDS } from "@/lib/registry";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

import {
  PRIVACY_TAG,
  type AccessAction,
  type AccessLogRow,
  type AccessSubjectType,
  type PrivacyText,
  type PublicPrivacy,
  type RetentionRow,
} from "./privacy";

/** นโยบายและข้อความแจ้ง (หน้าสาธารณะ แคช 5 นาที ล้างเมื่อผู้ดูแลระบบบันทึก) */
export const fetchPublicPrivacy = unstable_cache(
  async (): Promise<PublicPrivacy> => {
    const { data, error } = await createPublicClient().rpc("public_privacy");
    if (error) throw new Error(error.message);
    const v = (data ?? {}) as Partial<PublicPrivacy>;
    return { policy: v.policy ?? [], notices: v.notices ?? {}, updated_at: v.updated_at ?? null };
  },
  ["public-privacy"],
  { revalidate: PUBLIC_CACHE_SECONDS, tags: [PRIVACY_TAG] },
);

/**
 * บันทึกการเข้าดูข้อมูลบุคคล (ใครดูของใครเมื่อใด) เรียกจากหน้า ส่งออก และพิมพ์ที่แสดงข้อมูลบุคคล
 * ห้ามใส่เลขประจำตัวประชาชนหรือวันเกิดใน detail ล้มเหลวแล้วไม่ขัดการแสดงหน้า
 */
export async function logPersonAccess(type: AccessSubjectType, subjectId: string, action: AccessAction, detail = ""): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("log_person_access", { p_type: type, p_subject: subjectId, p_action: action, p_detail: detail.slice(0, 300) });
  } catch {
    // ไม่ขัดการทำงานของหน้า
  }
}

export async function fetchPrivacyTexts(): Promise<PrivacyText[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("privacy_texts").select("key, kind, title, body, sort_order, updated_at").order("sort_order");
  return (data as PrivacyText[] | null) ?? [];
}

export async function fetchRetentionSummary(): Promise<RetentionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("retention_due_summary");
  return (data as RetentionRow[] | null) ?? [];
}

export type AccessLogFilters = { viewer: string | null; type: string; subject: string; from: string | null; to: string | null };

export async function fetchAccessLogs(f: AccessLogFilters, limit: number, offset: number): Promise<{ rows: AccessLogRow[]; total: number }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("person_access_log_rows", {
    p_viewer: f.viewer,
    p_type: f.type || null,
    p_subject: f.subject || null,
    p_from: f.from,
    p_to: f.to,
    p_limit: limit,
    p_offset: offset,
  });
  const rows = (data as AccessLogRow[] | null) ?? [];
  return { rows, total: Number(rows[0]?.total_count ?? 0) };
}
