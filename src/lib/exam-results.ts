/** ผลสอบ ประกาศผล บัญชีผู้สอบได้ ศ.๔ ศ.๘ (บทที่ 21): ชนิดข้อมูล ป้ายชื่อ และตัวช่วยที่ใช้ได้ทั้งหน้าจอและเซิร์ฟเวอร์ */

import { EXAM_LEVEL_LABEL, examName, type ExamLevel, type ExamType, type SignatureSlot } from "@/lib/exam-forms";

export const RESULTS = ["passed", "failed", "absent"] as const;
export type ResultCode = (typeof RESULTS)[number];
export const RESULT_LABEL: Record<ResultCode, string> = { passed: "สอบได้", failed: "สอบตก", absent: "ขาดสอบ" };
export const RESULT_CLASS: Record<ResultCode, string> = {
  passed: "bg-green-100 text-green-900",
  failed: "bg-red-100 text-red-900",
  absent: "bg-muted text-muted-foreground",
};
export const isResultCode = (v: unknown): v is ResultCode => typeof v === "string" && (RESULTS as readonly string[]).includes(v);

export const RESULT_STATUS_LABEL = { draft: "ร่าง (ยังไม่ประกาศ)", published: "ประกาศแล้ว" } as const;
export type ResultStatus = keyof typeof RESULT_STATUS_LABEL;

/** วิชาที่มีคะแนน (ชื่อเดียวกับรายวิชาในคลังข้อสอบ บทที่ 12) */
export const SUBJECTS = [
  { key: "kratu", label: "กระทู้ธรรม" },
  { key: "dhamma", label: "ธรรม" },
  { key: "buddha", label: "พุทธ" },
  { key: "vinaya", label: "วินัย" },
] as const;
export type SubjectKey = (typeof SUBJECTS)[number]["key"];
export type Scores = Partial<Record<SubjectKey, number>>;

/** ป้ายแท็กแคชของหน้าสาธารณะ ค้นผลสอบ และสถิติผลสอบ */
export const RESULTS_TAG = "exam-results";

/** แปลงเลขไทยเป็นอารบิก ยุบช่องว่าง */
export const normalizeText = (s: string) =>
  String(s ?? "")
    .replace(/[๐-๙]/g, (d) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();

/** ข้อความผลสอบในไฟล์ > รหัส (ว่าง = ยังไม่กรอก, ข้อความอื่นส่งต่อให้ฐานข้อมูลแจ้งว่าผิด) */
export function parseResultText(text: string): string {
  const t = normalizeText(text).replace(/\s+/g, "");
  if (!t) return "";
  if (["สอบได้", "ได้", "ผ่าน", "passed"].includes(t)) return "passed";
  if (["สอบตก", "ตก", "ไม่ผ่าน", "failed"].includes(t)) return "failed";
  if (["ขาดสอบ", "ขาด", "absent"].includes(t)) return "absent";
  return t.slice(0, 20);
}

/** คะแนนในไฟล์ > ตัวเลข (ว่าง = null, ข้อความที่ไม่ใช่ตัวเลขส่งต่อให้ฐานข้อมูลแจ้งว่าผิด) */
export function parseScore(text: string): number | string | null {
  const t = normalizeText(text);
  if (!t) return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : t.slice(0, 20);
}

/** หัวคอลัมน์ของไฟล์นำเข้าผลสอบ (แถวแรก) ชื่อ สำนัก สนามสอบ เติมไว้ให้ดู ไม่ใช้ตอนนำเข้า */
export const RESULT_IMPORT_HEADERS = [
  "รหัสผู้สมัคร",
  "ชื่อ",
  "สำนัก",
  "สนามสอบ",
  "ผลสอบ",
  ...SUBJECTS.map((s) => s.label),
  "เลขที่ ปกศ.",
  "หมายเหตุ",
] as const;
export const RESULT_IMPORT_MAX_ROWS = 5000;

export type ResultImportRow = {
  row_no: number;
  code: string;
  result: string;
  scores: Record<SubjectKey, number | string | null>;
  certificate_no: string;
  note: string;
};

export function resultRowFromCells(rowNumber: number, cells: string[]): ResultImportRow {
  const scoreAt = 5;
  const scores = Object.fromEntries(SUBJECTS.map((s, i) => [s.key, parseScore(cells[scoreAt + i] ?? "")])) as Record<
    SubjectKey,
    number | string | null
  >;
  return {
    row_no: rowNumber,
    code: normalizeText(cells[0] ?? "").replace(/\s+/g, "").slice(0, 40),
    result: parseResultText(cells[4] ?? ""),
    scores,
    certificate_no: normalizeText(cells[scoreAt + SUBJECTS.length] ?? "").slice(0, 60),
    note: normalizeText(cells[scoreAt + SUBJECTS.length + 1] ?? "").slice(0, 250),
  };
}

/** หัวคอลัมน์ของไฟล์นำเข้าผลสอบได้ย้อนหลัง */
export const HISTORY_IMPORT_HEADERS = [
  "เลขประจำตัวประชาชน",
  "คำนำหน้า",
  "ชื่อ",
  "ฉายา",
  "นามสกุล",
  "วันเกิด",
  "ประเภท",
  "ชั้น",
  "ปี พ.ศ. ที่สอบได้",
  "เลขที่ ปกศ.",
  "สำนักเรียน",
  "หมายเหตุ",
] as const;

export const parseExamTypeText = (t: string): string => {
  const s = normalizeText(t).replace(/\s+/g, "");
  if (s === "นักธรรม" || s === "nak_tham") return "nak_tham";
  if (s === "ธรรมศึกษา" || s === "tham_sueksa") return "tham_sueksa";
  return s.slice(0, 20);
};
export const parseLevelText = (t: string): string => {
  const s = normalizeText(t).replace(/\s+/g, "").replace(/^ชั้น/, "");
  if (s === "ตรี" || s === "tri") return "tri";
  if (s === "โท" || s === "tho") return "tho";
  if (s === "เอก" || s === "ek") return "ek";
  return s.slice(0, 20);
};

// ---------------------------------------------------------------
// ชนิดข้อมูลจากฐานข้อมูล
// ---------------------------------------------------------------
export type ResultRound = {
  id: string;
  year_be: number;
  exam_type: ExamType;
  level: ExamLevel;
  status: string;
  result_status: ResultStatus;
  results_published_at: string | null;
  results_announced_on: string | null;
  candidates: number;
  results: number;
  passed: number;
  failed: number;
  absent: number;
};

export type ResultRow = {
  candidate_id: string;
  candidate_code: string;
  title: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  stage: string;
  place_name: string;
  venue_code: string;
  venue_name: string;
  result: ResultCode | null;
  scores: Scores | null;
  certificate_no: string | null;
  note: string | null;
  updated_at: string | null;
  total: number;
};

export type ResultHistoryItem = {
  created_at: string;
  action: "import" | "edit" | "publish";
  candidate_code: string | null;
  full_name: string | null;
  before_data: { result?: ResultCode; scores?: Scores; certificate_no?: string; note?: string } | null;
  after_data: Record<string, unknown> | null;
  reason: string;
  after_publish: boolean;
  actor_name: string | null;
};

export type PassHistoryRow = {
  id: string;
  exam_type: ExamType;
  level: ExamLevel;
  year_be: number;
  title: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  birth_date: string | null;
  national_id_last4: string | null;
  certificate_no: string;
  place_name: string;
  note: string;
  is_active: boolean;
  created_at: string;
  total: number;
};

export type ResultForm = { exam_type: ExamType; code: string; certify_text: string; signatures: SignatureSlot[] };

export type PassListRow = {
  place_id: string;
  place_code: string;
  place_name: string;
  venue_id: string;
  venue_code: string;
  venue_name: string;
  stage: string;
  candidate_id: string;
  candidate_code: string;
  title: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  age: number | null;
  phansa: number | null;
  vals: Record<string, string>;
  result: ResultCode | null;
  certificate_no: string | null;
  note: string | null;
  announced_on: string | null;
  result_status: ResultStatus;
};

export type PassListOption = { kind: "venue" | "place"; id: string; code: string; name: string; candidates: number; passed: number };

// ---------------------------------------------------------------
// บัญชีผู้สอบได้ ศ.๔ ศ.๘ (ตามไฟล์จริงที่ผู้สั่งงานแนบ ฉบับ 2568)
// ---------------------------------------------------------------
/** ลักษณนาม: นักธรรม = รูป ธรรมศึกษา = คน (ตามแบบจริง) */
export const personUnit = (type: ExamType) => (type === "nak_tham" ? "รูป" : "คน");

/** ช่วงชั้นแบบเต็มที่พิมพ์ในชื่อบัญชี เช่น (อุดมศึกษา) */
export const STAGE_FULL: Record<string, string> = { ประถม: "ประถมศึกษา", มัธยม: "มัธยมศึกษา", อุดม: "อุดมศึกษา" };
export const stageFull = (s: string) => STAGE_FULL[s] ?? s;

/** ชื่อการสอบในบัญชี เช่น นักธรรมชั้นเอก หรือ ธรรมศึกษาชั้นเอก (อุดมศึกษา) */
export const passListExam = (type: ExamType, level: ExamLevel, stage: string) =>
  `${examName(type, level)}${type === "tham_sueksa" && stage ? ` (${stageFull(stage)})` : ""}`;

/** ชื่อบัญชีตามแบบ เช่น บัญชีรายชื่อผู้สอบประโยค นักธรรมชั้นเอก ได้ */
export const passListTitle = (type: ExamType, level: ExamLevel, stage: string) =>
  `บัญชีรายชื่อผู้สอบประโยค ${passListExam(type, level, stage)} ได้`;

export type PassSummary = { sent: number; absent: number; remaining: number; passed: number; failed: number; missing: number };

/** ยอดตามแบบ: ส่งสอบ ขาดสอบ คงสอบ (ส่งสอบ - ขาดสอบ) สอบได้ สอบตก */
export function passSummary(rows: Pick<PassListRow, "result">[]): PassSummary {
  const sent = rows.length;
  const absent = rows.filter((r) => r.result === "absent").length;
  const passed = rows.filter((r) => r.result === "passed").length;
  const failed = rows.filter((r) => r.result === "failed").length;
  return { sent, absent, remaining: sent - absent, passed, failed, missing: rows.filter((r) => !r.result).length };
}

/** ร้อยละสอบได้ = สอบได้ ÷ คงสอบ (ตามแบบจริง) ทศนิยมไม่เกิน 2 ตำแหน่ง */
export function passPercent(passed: number, remaining: number): string {
  if (!remaining) return "0";
  const p = Math.round((passed / remaining) * 10000) / 100;
  return Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/0$/, "");
}

/** ตัวเลขในบรรทัดยอด: ศูนย์แสดงเป็น - (ตามแบบจริง) */
export const dashZero = (n: number) => (n === 0 ? "-" : String(n));

export type PassSection = {
  key: string;
  title: string;
  heading: string;
  stage: string;
  place_name: string;
  venue_name: string;
  rows: PassListRow[];
  summary: PassSummary;
};

/**
 * แบ่งรายชื่อเป็นบัญชีตามแบบ: หนึ่งบัญชีต่อสำนัก (by = place) หรือต่อสนามสอบ (by = venue)
 * ธรรมศึกษาแยกช่วงชั้น (ชื่อบัญชีมีช่วงชั้นในวงเล็บ ตามแบบ ศ.๘)
 */
export function passSections(rows: PassListRow[], type: ExamType, level: ExamLevel, by: "place" | "venue"): PassSection[] {
  const map = new Map<string, PassSection>();
  for (const r of rows) {
    const stage = type === "tham_sueksa" ? r.stage : "";
    const key = `${by === "place" ? r.place_id : r.venue_id}|${stage}`;
    let s = map.get(key);
    if (!s) {
      s = {
        key,
        title: passListTitle(type, level, stage),
        heading:
          by === "place"
            ? /^สำนัก/.test(r.place_name)
              ? r.place_name
              : `สำนักเรียน ${r.place_name}`
            : /^สนาม/.test(r.venue_name)
              ? r.venue_name
              : `สนามสอบ ${r.venue_name}`,
        stage,
        place_name: r.place_name,
        venue_name: r.venue_name,
        rows: [],
        summary: { sent: 0, absent: 0, remaining: 0, passed: 0, failed: 0, missing: 0 },
      };
      map.set(key, s);
    }
    s.rows.push(r);
  }
  return [...map.values()]
    .map((s) => ({ ...s, summary: passSummary(s.rows) }))
    .sort((a, b) => a.heading.localeCompare(b.heading, "th") || a.stage.localeCompare(b.stage, "th"));
}

/** เลขที่ ปกศ. เรียงตามตัวเลข */
export const certSort = (a: PassListRow, b: PassListRow) =>
  (a.certificate_no || "~").localeCompare(b.certificate_no || "~", "th", { numeric: true }) ||
  a.candidate_code.localeCompare(b.candidate_code);

export const EXAM_LEVEL_NAME = EXAM_LEVEL_LABEL;

// ---------------------------------------------------------------
// หน้าสาธารณะ
// ---------------------------------------------------------------
export type PublicResultStatRow = {
  year_be: number;
  exam_type: ExamType;
  level: ExamLevel;
  stage: string;
  region_name: string;
  province_name: string;
  sent: number;
  absent: number;
  passed: number;
  failed: number;
  no_result: number;
};
export type PublicResultPlace = { province_code: number | null; province_name: string; place_id: string; place_name: string; passed: number };
export type PublicPasser = { title: string; first_name: string; monastic_name: string; last_name: string; stage: string; place_name: string };
export type PublicResultSearch =
  | { ok: true; total: number; rows: PublicPasser[] }
  | { ok: false; error: string; limited?: boolean };

export const passerName = (r: Pick<PublicPasser, "title" | "first_name" | "monastic_name" | "last_name">) =>
  [r.title, r.first_name, r.monastic_name, r.last_name].filter((s) => s && s.trim()).join(" ");
