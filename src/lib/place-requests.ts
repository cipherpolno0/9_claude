/** คำขอจัดตั้งและยุบสำนักเรียน สำนักศาสนศึกษา (ระบบที่ 4): ชนิด ป้ายชื่อ และข้อมูลคำขอ */

import type { RequestStatus } from "@/lib/requests/labels";

export const PLACE_REQUEST_TYPES = ["samnak_establish", "samnak_dissolve"] as const;
export type PlaceRequestType = (typeof PLACE_REQUEST_TYPES)[number];

export const PLACE_REQUEST_LABEL: Record<PlaceRequestType, string> = {
  samnak_establish: "ขอจัดตั้ง",
  samnak_dissolve: "ขอยุบ",
};

export const isPlaceRequestType = (value: unknown): value is PlaceRequestType =>
  typeof value === "string" && (PLACE_REQUEST_TYPES as readonly string[]).includes(value);

export const SAMNAK_TYPES = ["samnak_rian", "samnak_sasanasuksa"] as const;
export type SamnakType = (typeof SAMNAK_TYPES)[number];
export const SAMNAK_TYPE_LABEL: Record<SamnakType, string> = {
  samnak_rian: "สำนักเรียน",
  samnak_sasanasuksa: "สำนักศาสนศึกษา",
};
export const isSamnakType = (value: unknown): value is SamnakType =>
  typeof value === "string" && (SAMNAK_TYPES as readonly string[]).includes(value);

/** แผนกที่กรอกจำนวนครูและนักเรียน (ผู้สั่งงานกำหนด: นักธรรม บาลี ธรรมศึกษา) ต้องตรงกับ private.build_place_request */
export const DEPARTMENTS = [
  { key: "nak_tham", label: "นักธรรม" },
  { key: "pali", label: "บาลี" },
  { key: "tham_sueksa", label: "ธรรมศึกษา" },
] as const;
export type DepartmentKey = (typeof DEPARTMENTS)[number]["key"];
export type DepartmentCounts = Record<DepartmentKey, { teachers: number; students: number }>;

/** ค่าเริ่มต้นของกำหนดเวลาพิจารณาต่อชั้น (วัน) ถ้าอ่านค่าตั้ง place_request_step_days ไม่ได้ */
export const DEFAULT_STEP_DAYS = 15;

export type PlaceRequestRow = {
  id: string;
  request_no: string;
  type_key: PlaceRequestType;
  type_name: string;
  title: string;
  status: RequestStatus;
  subject_name: string | null;
  place_type: string | null;
  temple_name: string | null;
  org_unit_name: string;
  requester_is_me: boolean;
  submitted_at: string;
  decided_at: string | null;
  current_step: number | null;
  step_count: number;
  current_unit_name: string | null;
  pending_since: string | null;
  due_at: string | null;
  overdue_days: number;
  can_decide: boolean;
  total_count: number;
};

export type RequestDocument = {
  doc_type_id: string;
  name: string;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  file_count: number;
};

export type RequestDocumentType = {
  id: string;
  type_key: string;
  name: string;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
};

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** อ่านจำนวนครูและนักเรียนจากข้อมูลคำขอ (ค่าที่ขาดหรือผิดรูปแบบ = 0) */
export function readCounts(payload: Record<string, unknown>): DepartmentCounts {
  const raw = (payload.counts ?? {}) as Record<string, { teachers?: unknown; students?: unknown } | undefined>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return Object.fromEntries(
    DEPARTMENTS.map((d) => [d.key, { teachers: num(raw[d.key]?.teachers), students: num(raw[d.key]?.students) }]),
  ) as DepartmentCounts;
}

export type PlaceRequestPayload = {
  name: string;
  placeType: SamnakType | null;
  templeId: string;
  templeName: string;
  unitName: string;
  headPersonId: string;
  headName: string;
  counts: DepartmentCounts;
  buildings: string;
  detail: string;
  supportPlan: string;
  placeId: string;
  placeCode: string;
};

export function readPlaceRequestPayload(payload: Record<string, unknown>): PlaceRequestPayload {
  return {
    name: text(payload.name),
    placeType: isSamnakType(payload.place_type) ? payload.place_type : null,
    templeId: text(payload.temple_id),
    templeName: text(payload.temple_name),
    unitName: text(payload.unit_name),
    headPersonId: text(payload.head_person_id),
    headName: text(payload.head_name),
    counts: readCounts(payload),
    buildings: text(payload.buildings),
    detail: text(payload.detail),
    supportPlan: text(payload.support_plan),
    placeId: text(payload.place_id),
    placeCode: text(payload.place_code),
  };
}

const bangkokDay = (d: Date) => Date.parse(d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }));

/**
 * กำหนดเวลาพิจารณาของขั้นที่รออยู่: ครบกำหนด = เวลาที่เริ่มรอ + จำนวนวันที่ตั้งไว้ (นับวันตามปฏิทิน)
 * overdueDays นับตามวันที่ของประเทศไทย อย่างน้อย 1 เมื่อเกินกำหนด (ตรงกับ list_place_requests ในฐานข้อมูล)
 */
export function stepDeadline(pendingSince: string | null | undefined, days: number, now = new Date()) {
  if (!pendingSince) return null;
  const since = new Date(pendingSince);
  if (Number.isNaN(since.getTime())) return null;
  const dueAt = new Date(since.getTime() + days * 86_400_000);
  const overdue = dueAt.getTime() < now.getTime();
  const overdueDays = overdue ? Math.max(1, Math.round((bangkokDay(now) - bangkokDay(dueAt)) / 86_400_000)) : 0;
  const daysLeft = overdue ? 0 : Math.max(0, Math.round((bangkokDay(dueAt) - bangkokDay(now)) / 86_400_000));
  return { since, dueAt, overdueDays, daysLeft };
}
