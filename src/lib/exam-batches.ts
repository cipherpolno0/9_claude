/** บัญชีผู้สมัครสอบ (ระบบที่ 9 บทที่ 18-19): ชนิดข้อมูลและป้ายชื่อ ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */

import type { ExamLevel, ExamType, FormColumn } from "@/lib/exam-forms";

export const BATCH_STATUSES = ["draft", "confirmed", "submitted", "returned", "certified", "withdrawn"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];
export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  draft: "ร่าง (รอยืนยัน)",
  confirmed: "ยืนยันแล้ว (ยังไม่ส่ง)",
  submitted: "ส่งแล้ว รอรับรอง",
  returned: "ถูกส่งกลับแก้ไข",
  certified: "รับรองแล้ว",
  withdrawn: "ถอนแล้ว",
};
export const BATCH_STATUS_CLASS: Record<BatchStatus, string> = {
  draft: "bg-amber-100 text-amber-900",
  confirmed: "bg-secondary text-primary",
  submitted: "bg-blue-100 text-blue-900",
  returned: "bg-orange-100 text-orange-900",
  certified: "bg-green-100 text-green-900",
  withdrawn: "bg-muted text-muted-foreground",
};
/** บัญชีที่ส่งแล้ว (นับในสถิติและยอดต่อสนามสอบ) */
export const SENT_STATUSES: BatchStatus[] = ["submitted", "returned", "certified"];
export const BATCH_SCOPES = ["all", "mine", "area"] as const;
export type BatchScope = (typeof BATCH_SCOPES)[number];
export const BATCH_SCOPE_LABEL: Record<BatchScope, string> = {
  all: "ทั้งหมดที่ท่านเห็น",
  mine: "บัญชีที่ท่านอัปโหลด",
  area: "บัญชีที่ส่งในเขต",
};
export const isBatchStatus = (v: unknown): v is BatchStatus =>
  typeof v === "string" && (BATCH_STATUSES as readonly string[]).includes(v);

export type BatchListItem = {
  id: string;
  status: BatchStatus;
  year_be: number;
  exam_type: ExamType;
  level: ExamLevel;
  form_code: string;
  place_name: string;
  venue_name: string;
  venue_code: string;
  file_name: string;
  row_count: number;
  ok_count: number;
  error_count: number;
  saved_count: number;
  uploaded_by_me: boolean;
  created_at: string;
  confirmed_at: string | null;
};

/** แถวของ list_registration_accounts */
export type AccountItem = BatchListItem & {
  place_code: string;
  unit_name: string;
  submitted_at: string | null;
  certified_at: string | null;
  request_id: string | null;
  request_no: string | null;
  request_status: string | null;
  current_unit_name: string | null;
};

/** โหมดแก้ไข: open = ก่อนปิดรับสมัคร บัญชียังไม่ส่ง / override = ส่วนกลางแก้แทน ต้องมีเหตุผล / null = แก้ไม่ได้ */
export type EditMode = "open" | "override" | null;

export type BatchDetail = {
  id: string;
  status: BatchStatus;
  file_name: string;
  file_size: number;
  has_file: boolean;
  row_count: number;
  ok_count: number;
  error_count: number;
  saved_count: number;
  created_at: string;
  confirmed_at: string | null;
  withdrawn_at: string | null;
  withdraw_reason: string;
  uploaded_by_me: boolean;
  uploader_name: string;
  can_act: boolean;
  edit_mode: EditMode;
  is_central: boolean;
  pending_error_count: number;
  withdrawn_count: number;
  submitted_at: string | null;
  certified_at: string | null;
  request: { id: string; request_no: string; status: string; requester_is_me: boolean } | null;
  files: { file_no: number; file_name: string; row_count: number; created_at: string }[];
  round: {
    id: string;
    year_be: number;
    exam_type: ExamType;
    level: ExamLevel;
    exam_starts_on: string;
    closes_on: string;
    accepting: boolean;
  };
  template: { id: string; code: string; columns: FormColumn[] };
  place: { id: string; code: string; name: string };
  venue: { id: string; code: string; name: string };
};

export type CandidateError = { field: string; label: string; message: string };

export const CANDIDATE_STATUS_LABEL = {
  ok: "ผ่าน",
  error: "ไม่ผ่าน",
  excluded: "ไม่ผ่าน (ไม่ได้บันทึก)",
  withdrawn: "ถอนแล้ว",
} as const;
export type CandidateStatus = keyof typeof CANDIDATE_STATUS_LABEL;

export type CandidateRow = {
  id: string;
  row_no: number;
  seq: number | null;
  candidate_code: string | null;
  person_kind: "monastic" | "lay";
  title: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  birth_date: string | null;
  ordination_date: string | null;
  age: number | null;
  phansa: number | null;
  national_id_last4: string | null;
  id_kind: "nid" | "other" | "none";
  school_name: string;
  stage: string;
  extra: Record<string, string>;
  errors: CandidateError[];
  status: CandidateStatus;
  counted: boolean;
  file_no: number;
  withdrawn_at: string | null;
  withdraw_reason: string;
};

/** ที่มาของแถว: ไฟล์ที่ 1, 2.. หรือเพิ่มบนหน้าจอ */
export const rowSource = (c: Pick<CandidateRow, "file_no" | "row_no">) =>
  c.file_no === 0 ? `เพิ่มบนหน้าจอ ${c.row_no}` : c.file_no === 1 ? `แถว ${c.row_no}` : `ไฟล์ ${c.file_no} แถว ${c.row_no}`;

export const CHANGE_ACTION_LABEL: Record<string, string> = {
  add: "เพิ่มรายชื่อ",
  edit: "แก้ไขรายชื่อ",
  withdraw: "ถอนรายชื่อ",
  append_file: "อัปโหลดไฟล์เพิ่มเติม",
  confirm: "ยืนยันรายชื่อ",
  submit: "ส่งบัญชี",
  resubmit: "ส่งบัญชีอีกครั้ง",
  returned: "ถูกส่งกลับแก้ไข",
  certified: "รับรองครบแล้ว",
  rejected: "ไม่รับรอง",
  cancelled: "ยกเลิกการส่ง (ดึงบัญชีกลับ)",
  withdraw_batch: "ถอนทั้งบัญชี",
};

export type HistoryItem = {
  created_at: string;
  action: string;
  reason: string;
  after_close: boolean;
  detail: { name?: string; row?: string; fields?: string[]; request_no?: string; file_no?: number; file_name?: string; rows?: number; saved?: number; excluded?: number; candidates?: number; candidate_code?: string };
  actor_name: string | null;
};

/** ยอดผู้สมัครต่อสนามสอบ (venue_registration_totals) */
export type VenueTotalRow = {
  venue_id: string;
  venue_code: string;
  venue_name: string;
  region_name: string | null;
  province_name: string | null;
  stage: string;
  sent_count: number;
  certified_count: number;
  account_count: number;
  pending_account_count: number;
};

/** สถิติสาธารณะ (public_registration_stats) */
export type PublicStatRow = {
  year_be: number;
  exam_type: ExamType;
  level: ExamLevel;
  stage: string;
  region_name: string;
  province_name: string;
  candidates: number;
};

export const CANDIDATE_COLUMNS =
  "id, row_no, seq, candidate_code, person_kind, title, first_name, monastic_name, last_name, birth_date, ordination_date, age, phansa, national_id_last4, id_kind, school_name, stage, extra, errors, status, counted, file_no, withdrawn_at, withdraw_reason";

export const REGISTRATION_STATS_TAG = "registration-stats";

/** ชื่อเต็มของผู้สมัคร เช่น สามเณร สมชาย ฉายา ใจดี */
export const candidateName = (c: Pick<CandidateRow, "title" | "first_name" | "monastic_name" | "last_name">) =>
  [c.title, c.first_name, c.monastic_name, c.last_name].filter((s) => s && s.trim()).join(" ");

/** เลขประจำตัวที่แสดงได้ (ปิดไว้ เหลือ 4 ตัวท้าย) */
export function maskedId(c: Pick<CandidateRow, "national_id_last4" | "id_kind">): string {
  if (!c.national_id_last4) return "-";
  return c.id_kind === "nid" ? `*********${c.national_id_last4}` : `****${c.national_id_last4}`;
}

export const BATCH_PAGE_SIZE = 200;
