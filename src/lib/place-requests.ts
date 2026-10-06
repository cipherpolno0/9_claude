/** คำขอจัดตั้งและยุบสำนักเรียน สำนักศาสนศึกษา (ระบบที่ 4): ชนิด ป้ายชื่อ และข้อมูลคำขอ */

import type { RequestStatus } from "@/lib/requests/labels";
import { VENUE_TYPE_LABEL, isVenueType, type VenueType } from "@/lib/venues";

export const PLACE_REQUEST_TYPES = ["samnak_establish", "samnak_dissolve", "venue_open", "venue_close", "venue_move"] as const;
export type PlaceRequestType = (typeof PLACE_REQUEST_TYPES)[number];

/** คำนำหน้าเรื่อง ต่อด้วยประเภทสำนักหรือประเภทสนามสอบ เช่น ขอจัดตั้ง + สำนักเรียน, ขอเปิดสนามสอบ + นักธรรม */
export const PLACE_REQUEST_LABEL: Record<PlaceRequestType, string> = {
  samnak_establish: "ขอจัดตั้ง",
  samnak_dissolve: "ขอยุบ",
  venue_open: "ขอเปิดสนามสอบ",
  venue_close: "ขอปิดสนามสอบ",
  venue_move: "ขอย้ายสนามสอบ",
};

/** ชื่อเต็มของชนิดคำขอ สำหรับตัวกรอง หัวข้อ และหน้าตั้งค่ารายการเอกสาร */
export const PLACE_REQUEST_TITLE: Record<PlaceRequestType, string> = {
  samnak_establish: "ขอจัดตั้งสำนักเรียน สำนักศาสนศึกษา",
  samnak_dissolve: "ขอยุบสำนักเรียน สำนักศาสนศึกษา",
  venue_open: "ขอเปิดสนามสอบ",
  venue_close: "ขอปิดสนามสอบ",
  venue_move: "ขอย้ายสนามสอบ",
};

export const VENUE_REQUEST_TYPES = ["venue_open", "venue_close", "venue_move"] as const;
export type VenueRequestType = (typeof VENUE_REQUEST_TYPES)[number];
export const isVenueRequestType = (value: unknown): value is VenueRequestType =>
  typeof value === "string" && (VENUE_REQUEST_TYPES as readonly string[]).includes(value);

/** ค่าของ ?type= ในหน้า /app/requests/new */
export const REQUEST_TYPE_PARAM: Record<PlaceRequestType, string> = {
  samnak_establish: "establish",
  samnak_dissolve: "dissolve",
  venue_open: "venue-open",
  venue_close: "venue-close",
  venue_move: "venue-move",
};
export function requestTypeFromParam(param: string | undefined): PlaceRequestType | null {
  const found = PLACE_REQUEST_TYPES.find((t) => REQUEST_TYPE_PARAM[t] === param);
  return found ?? null;
}

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

/** ป้ายของประเภทสำนัก (สำนักเรียน สำนักศาสนศึกษา) หรือประเภทสนามสอบ (นักธรรม ธรรมศึกษา) ว่างถ้าไม่รู้จัก */
export function requestKindLabel(kind: unknown): string {
  if (isSamnakType(kind)) return SAMNAK_TYPE_LABEL[kind];
  if (isVenueType(kind)) return VENUE_TYPE_LABEL[kind];
  return "";
}

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

export type VenueRequestPayload = {
  name: string;
  venueType: VenueType | null;
  venueId: string;
  venueCode: string;
  placeId: string;
  placeName: string;
  unitName: string;
  levels: string[];
  capacity: number | null;
  chairPersonId: string;
  chairName: string;
  receiverPersonId: string;
  receiverName: string;
  startYear: number | null;
  detail: string;
  replacementVenueId: string;
  replacementName: string;
  replacementCode: string;
  toPlaceId: string;
  toPlaceName: string;
  effectiveYear: number | null;
};

/** อ่านข้อมูลคำขอเปิด ปิด ย้ายสนามสอบ (คีย์ต้องตรงกับ private.build_venue_request) */
export function readVenueRequestPayload(payload: Record<string, unknown>): VenueRequestPayload {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    name: text(payload.name),
    venueType: isVenueType(payload.venue_type) ? payload.venue_type : null,
    venueId: text(payload.venue_id),
    venueCode: text(payload.venue_code),
    placeId: text(payload.place_id),
    placeName: text(payload.place_name),
    unitName: text(payload.unit_name),
    levels: Array.isArray(payload.levels) ? payload.levels.filter((l): l is string => typeof l === "string") : [],
    capacity: num(payload.capacity),
    chairPersonId: text(payload.chair_person_id),
    chairName: text(payload.chair_name),
    receiverPersonId: text(payload.receiver_person_id),
    receiverName: text(payload.receiver_name),
    startYear: num(payload.start_year_be),
    detail: text(payload.detail),
    replacementVenueId: text(payload.replacement_venue_id),
    replacementName: text(payload.replacement_name),
    replacementCode: text(payload.replacement_code),
    toPlaceId: text(payload.to_place_id),
    toPlaceName: text(payload.to_place_name),
    effectiveYear: num(payload.effective_year_be),
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
