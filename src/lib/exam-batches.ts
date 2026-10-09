/** ชุดรายชื่อผู้สมัครสอบที่อัปโหลด (ระบบที่ 9 บทที่ 18): ชนิดข้อมูลและป้ายชื่อ ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */

import type { ExamLevel, ExamType, FormColumn } from "@/lib/exam-forms";

export const BATCH_STATUSES = ["draft", "confirmed", "submitted", "withdrawn"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];
export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  draft: "ร่าง (รอยืนยัน)",
  confirmed: "ยืนยันแล้ว",
  submitted: "ส่งแล้ว",
  withdrawn: "ถอนแล้ว",
};
export const BATCH_STATUS_CLASS: Record<BatchStatus, string> = {
  draft: "bg-amber-100 text-amber-900",
  confirmed: "bg-green-100 text-green-900",
  submitted: "bg-blue-100 text-blue-900",
  withdrawn: "bg-muted text-muted-foreground",
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

export const CANDIDATE_STATUS_LABEL = { ok: "ผ่าน", error: "ไม่ผ่าน", excluded: "ไม่ผ่าน (ไม่ได้บันทึก)" } as const;
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
};

export const CANDIDATE_COLUMNS =
  "id, row_no, seq, candidate_code, person_kind, title, first_name, monastic_name, last_name, birth_date, ordination_date, age, phansa, national_id_last4, id_kind, school_name, stage, extra, errors, status, counted";

/** ชื่อเต็มของผู้สมัคร เช่น สามเณร สมชาย ฉายา ใจดี */
export const candidateName = (c: Pick<CandidateRow, "title" | "first_name" | "monastic_name" | "last_name">) =>
  [c.title, c.first_name, c.monastic_name, c.last_name].filter((s) => s && s.trim()).join(" ");

/** เลขประจำตัวที่แสดงได้ (ปิดไว้ เหลือ 4 ตัวท้าย) */
export function maskedId(c: Pick<CandidateRow, "national_id_last4" | "id_kind">): string {
  if (!c.national_id_last4) return "-";
  return c.id_kind === "nid" ? `*********${c.national_id_last4}` : `****${c.national_id_last4}`;
}

export const BATCH_PAGE_SIZE = 200;
