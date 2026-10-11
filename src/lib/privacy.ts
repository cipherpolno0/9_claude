/** ข้อมูลส่วนบุคคล (บทที่ 31): นโยบาย ข้อความแจ้งวัตถุประสงค์ บันทึกการเข้าดู อายุการเก็บ */

export const PRIVACY_TAG = "privacy";

export type PrivacyNoticeKey = "notice_contact" | "notice_account" | "notice_personnel" | "notice_registration" | "notice_quiz";

export type PublicPrivacy = {
  policy: { key: string; title: string; body: string }[];
  notices: Partial<Record<PrivacyNoticeKey, { title: string; body: string }>>;
  updated_at: string | null;
};

export type PrivacyText = { key: string; kind: "policy" | "notice"; title: string; body: string; sort_order: number; updated_at: string };

export const ACCESS_SUBJECT_TYPES = [
  "person",
  "education_staff",
  "candidate",
  "registration_batch",
  "registration_list",
  "person_search",
  "personnel_export",
  "personnel_report",
  "pass_list",
  "result_list",
  "contact_message",
] as const;
export type AccessSubjectType = (typeof ACCESS_SUBJECT_TYPES)[number];

export const ACCESS_SUBJECT_LABEL: Record<AccessSubjectType, string> = {
  person: "ประวัติบุคลากร",
  education_staff: "ประวัติ จศป.",
  candidate: "ผู้สมัครสอบรายคน",
  registration_batch: "บัญชีผู้สมัครสอบ",
  registration_list: "บัญชีรายชื่อ ศ.",
  person_search: "ค้นหารายบุคคล",
  personnel_export: "ส่งออกทะเบียนบุคลากร",
  personnel_report: "รายงานบุคลากร",
  pass_list: "บัญชีผู้สอบได้",
  result_list: "ผลสอบรายคน",
  contact_message: "ข้อความติดต่อ",
};

export type AccessAction = "view" | "export" | "print" | "search";
export const ACCESS_ACTION_LABEL: Record<AccessAction, string> = { view: "เปิดดู", export: "ส่งออก", print: "พิมพ์", search: "ค้นหา" };

export type AccessLogRow = {
  id: number;
  created_at: string;
  viewer_id: string;
  viewer_name: string;
  viewer_email: string;
  subject_type: AccessSubjectType;
  subject_id: string;
  subject_name: string | null;
  action: AccessAction;
  detail: string;
  total_count: number;
};

export type RetentionRow = {
  data_key: string;
  label: string;
  basis: string;
  years: number | null;
  note: string;
  due_count: number | null;
  oldest: string | null;
};

/** ลิงก์ไปหน้ารายการที่ถูกเข้าดู (ผู้ดูแลระบบกดตรวจต่อได้) */
export function accessSubjectHref(type: AccessSubjectType, id: string): string | null {
  if (!id) return null;
  if (type === "person") return `/app/personnel/${id}`;
  if (type === "registration_batch") return `/app/exams/batches/${id}`;
  if (type === "contact_message") return `/app/messages/${id}`;
  return null;
}
