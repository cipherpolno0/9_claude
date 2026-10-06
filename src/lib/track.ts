/** หน้าสาธารณะ ติดตามคำขอ (/track): ชนิดข้อมูลของฟังก์ชัน public_requests / public_request_status / public_request_summary */

import type { OrgLevel } from "@/lib/org-units";
import type { RequestStatus, TimelineStep } from "@/lib/requests/labels";

/** ป้ายแคชของหน้าติดตามคำขอ: เรียก revalidateTag(TRACK_TAG, { expire: 0 }) เมื่อมีการยื่นหรือพิจารณาคำขอ */
export const TRACK_TAG = "track";
export const TRACK_PAGE_SIZE = 20;

export type PublicRequestRow = {
  request_no: string;
  type_key: string;
  type_name: string;
  subject_name: string | null;
  kind: string | null;
  place_name: string | null;
  province_name: string | null;
  region_name: string | null;
  status: RequestStatus;
  current_step: number | null;
  step_count: number;
  current_level: OrgLevel | null;
  current_unit_name: string | null;
  submitted_at: string;
  decided_at: string | null;
  total_count: number;
};

/** สถานะของคำขอ 1 รายการ (ไม่มีชื่อบุคคล ความเห็น เหตุผล และเอกสารแนบ) */
export type PublicRequestStatus = {
  request_no: string;
  type_key: string;
  type_name: string;
  status: RequestStatus;
  current_step: number | null;
  submitted_at: string;
  decided_at: string | null;
  steps: TimelineStep[];
  subject_name?: string | null;
  kind?: string | null;
  place_name?: string | null;
  to_place_name?: string | null;
  province_name?: string | null;
  region_name?: string | null;
};

export type PublicSummaryRow = { region_name: string | null; type_key: string; status: RequestStatus; total: number };
