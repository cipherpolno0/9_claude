/** รอบสมัครสอบและแบบฟอร์มบัญชี ศ. (ระบบที่ 9): ชนิดข้อมูล ป้ายชื่อ และการตรวจที่ใช้ได้ทั้งหน้าจอและเซิร์ฟเวอร์ */

import { VENUE_LEVEL_LABEL, VENUE_LEVELS, VENUE_TYPE_LABEL, VENUE_TYPES, type VenueLevel, type VenueType } from "@/lib/venues";

export const EXAM_TYPES = VENUE_TYPES;
export type ExamType = VenueType;
export const EXAM_TYPE_LABEL = VENUE_TYPE_LABEL;
export const EXAM_LEVELS = VENUE_LEVELS;
export type ExamLevel = VenueLevel;
export const EXAM_LEVEL_LABEL = VENUE_LEVEL_LABEL;
export const isExamType = (v: unknown): v is ExamType => typeof v === "string" && (EXAM_TYPES as readonly string[]).includes(v);
export const isExamLevel = (v: unknown): v is ExamLevel => typeof v === "string" && (EXAM_LEVELS as readonly string[]).includes(v);

/** ชื่อเต็มของการสอบ เช่น นักธรรมชั้นตรี */
export const examName = (type: string, level: string) =>
  `${EXAM_TYPE_LABEL[type as ExamType] ?? type}${EXAM_LEVEL_LABEL[level as ExamLevel] ?? level}`;

// ---------------------------------------------------------------
// รอบสมัครสอบ
// ---------------------------------------------------------------
export const ROUND_STATUSES = ["draft", "open", "closed"] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];
export const ROUND_STATUS_LABEL: Record<RoundStatus, string> = {
  draft: "ร่าง",
  open: "เปิดรับสมัคร",
  closed: "ปิดรับสมัคร",
};
export const ROUND_STATUS_CLASS: Record<RoundStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-green-100 text-green-900",
  closed: "bg-amber-100 text-amber-900",
};

export type ExamRound = {
  id: string;
  academic_year_id: string;
  year_be: number;
  exam_type: ExamType;
  level: ExamLevel;
  opens_on: string;
  closes_on: string;
  exam_starts_on: string;
  exam_ends_on: string | null;
  status: RoundStatus;
  note: string;
  is_active: boolean;
  updated_at: string;
};

/** สถานะการรับสมัครของรอบในวันนี้ (ตรงกับ private.exam_round_accepting ในฐานข้อมูล) */
export function roundWindow(round: Pick<ExamRound, "status" | "opens_on" | "closes_on" | "is_active">, today: string) {
  if (!round.is_active) return { accepting: false, text: "ยกเลิกแล้ว" };
  if (round.status === "draft") return { accepting: false, text: "ยังไม่เปิดรับสมัคร (ร่าง)" };
  if (round.status === "closed") return { accepting: false, text: "ปิดรับสมัครแล้ว" };
  if (today < round.opens_on) return { accepting: false, text: "ยังไม่ถึงวันเปิดรับสมัคร" };
  if (today > round.closes_on) return { accepting: false, text: "พ้นวันปิดรับสมัครแล้ว" };
  return { accepting: true, text: "กำลังรับสมัคร" };
}

// ---------------------------------------------------------------
// แบบฟอร์มบัญชี ศ.
// ---------------------------------------------------------------
export const COLUMN_TYPES = ["number", "year", "date", "id", "text", "list", "title"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];
export const COLUMN_TYPE_LABEL: Record<ColumnType, string> = {
  number: "ตัวเลข (จำนวนเต็ม)",
  year: "ปี พ.ศ.",
  date: "วัน/เดือน/ปี พ.ศ.",
  id: "เลขประจำตัว",
  text: "ข้อความ",
  list: "เลือกจากรายการ",
  title: "คำนำหน้าชื่อ (รายการที่ผู้ดูแลระบบตั้ง)",
};
export const isColumnType = (v: unknown): v is ColumnType => typeof v === "string" && (COLUMN_TYPES as readonly string[]).includes(v);

export type FormColumn = {
  key: string;
  label: string;
  top: string;
  top_span: number;
  bottom: string;
  type: ColumnType;
  required: boolean;
  width: number;
  min?: number;
  max?: number;
  options?: string[];
  help_title?: string;
  help?: string;
  error_title?: string;
  error?: string;
  header_help_title?: string;
  header_help?: string;
  example?: string;
};

export const HEADER_FIELDS = [
  "year_be",
  "venue_code",
  "venue_name",
  "venue_subdistrict",
  "venue_district",
  "venue_province",
  "region_no",
] as const;
export type HeaderField = (typeof HEADER_FIELDS)[number];
export const HEADER_FIELD_LABEL: Record<HeaderField, string> = {
  year_be: "ปี พ.ศ. ที่สอบ",
  venue_code: "รหัสสนามสอบ",
  venue_name: "ชื่อสนามสอบ",
  venue_subdistrict: "ตำบลของสนามสอบ",
  venue_district: "อำเภอของสนามสอบ",
  venue_province: "จังหวัดของสนามสอบ",
  region_no: "เลขภาค",
};

export type HeaderCell = {
  cell: string;
  merge?: string | null;
  text?: string;
  field?: HeaderField;
  min?: number;
  max?: number;
  help_title?: string;
  help?: string;
  error?: string;
};

export type FormLayout = {
  row_heights?: Record<string, number>;
  value_fill?: string;
  value_font?: { name?: string; size?: number; color?: string };
  title_size?: number;
  header_bottom_red?: boolean;
  marker_font?: string;
};

/** ช่องลงนามท้ายบัญชีที่พิมพ์ (บทที่ 20: ผู้ดูแลระบบตั้งเองต่อแบบ) */
export type SignatureSlot = { text: string };

export type FormTemplate = {
  id: string;
  code: string;
  exam_type: ExamType;
  level: ExamLevel;
  sheet_name: string;
  marker_code: string;
  marker_no: number | null;
  version: string;
  notice: string;
  title: string;
  header_cells: HeaderCell[];
  columns: FormColumn[];
  layout: FormLayout;
  signatures?: SignatureSlot[];
  sort_order?: number;
  is_active?: boolean;
  updated_at?: string;
};

export type TitleOption = { id?: string; exam_type: ExamType; name: string; sort_order?: number; is_active?: boolean };

/** แถวแรกของข้อมูลในแม่แบบ และจำนวนแถวที่มีกฎตรวจ (ตามไฟล์จริง: แถว 9 ถึง 1008) */
export const DATA_FIRST_ROW = 9;
export const DATA_ROW_COUNT = 1000;

/** ตัวอักษรคอลัมน์ของ Excel จากลำดับ (เริ่ม 1) */
export function columnLetter(index: number): string {
  let n = index;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** ชื่อแบบฟอร์มที่แสดง เช่น ศ.๑ นักธรรมชั้นตรี */
export const templateLabel = (t: Pick<FormTemplate, "code" | "exam_type" | "level">) => `${t.code} ${examName(t.exam_type, t.level)}`;

/** คำอธิบายกฎตรวจของคอลัมน์ ใช้ในคู่มือการกรอกและหน้าตั้งค่า */
export function columnRuleText(col: FormColumn, titles: string[] = []): string {
  switch (col.type) {
    case "number":
    case "year":
      return `${COLUMN_TYPE_LABEL[col.type]} ${col.min ?? ""} ถึง ${col.max ?? ""} เป็นเลขอารบิก`;
    case "list":
      return `เลือกได้เฉพาะ ${(col.options ?? []).join(" / ")}`;
    case "title":
      return titles.length ? `เลือกจากรายการคำนำหน้า หรือพิมพ์คำนำหน้าเต็ม` : "พิมพ์คำนำหน้าเต็ม";
    case "date":
      return "พิมพ์ วัน/เดือน/ปี พ.ศ. เช่น 1/1/2540";
    default:
      return "ข้อความ";
  }
}

/** เลขภาคจากชื่อภาคของคณะสงฆ์ เช่น "ภาค 1" "ภาค ๑๒" (ไม่พบ = null) */
export function regionNoFromName(name: string | null | undefined): number | null {
  if (!name) return null;
  const normalized = name.replace(/[๐-๙]/g, (d) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)));
  const m = normalized.match(/ภาค\s*(\d{1,2})(?!\d)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 18 ? n : null;
}

const SHEET_NAME_BAD = /[[\]:*?/\\]/;
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/**
 * ตรวจรายการคอลัมน์ก่อนส่งบันทึก (ซ้ำกับ form_templates_check ในฐานข้อมูล) คืนข้อความผิดข้อแรก หรือ null
 */
export function columnsProblem(columns: FormColumn[]): string | null {
  if (columns.length < 1 || columns.length > 40) return "แบบฟอร์มต้องมีคอลัมน์ 1 ถึง 40 คอลัมน์";
  const keys = new Set<string>();
  for (const [i, c] of columns.entries()) {
    const n = i + 1;
    const name = c.label.trim() || `คอลัมน์ที่ ${n}`;
    if (!KEY_PATTERN.test(c.key)) return `${name}: รหัสคอลัมน์ต้องเป็นภาษาอังกฤษตัวเล็ก ตัวเลข หรือ _ ขึ้นต้นด้วยตัวอักษร`;
    if (keys.has(c.key)) return `รหัสคอลัมน์ ${c.key} ซ้ำกัน`;
    keys.add(c.key);
    if (!c.label.trim() || c.label.length > 100) return `คอลัมน์ที่ ${n}: กรุณากรอกชื่อคอลัมน์ (ไม่เกิน 100 ตัวอักษร)`;
    if (!c.top.trim() && !c.bottom.trim()) return `${name}: ต้องมีหัวตารางอย่างน้อย 1 บรรทัด`;
    if (c.top.length > 200 || c.bottom.length > 200) return `${name}: หัวตารางยาวเกิน 200 ตัวอักษร`;
    if (!isColumnType(c.type)) return `${name}: ชนิดข้อมูลไม่ถูกต้อง`;
    if (!Number.isInteger(c.top_span) || c.top_span < 1 || i + c.top_span > columns.length) {
      return `${name}: หัวรวมครอบคอลัมน์เกินจำนวนคอลัมน์ที่มี`;
    }
    if (!Number.isFinite(c.width) || c.width < 3 || c.width > 80) return `${name}: ความกว้างต้องเป็นตัวเลข 3 ถึง 80`;
    if (c.type === "number" || c.type === "year") {
      if (!Number.isInteger(c.min) || !Number.isInteger(c.max) || (c.min ?? 0) < 0 || (c.max ?? 0) > 1_000_000_000 || (c.min ?? 0) > (c.max ?? 0)) {
        return `${name}: ค่าต่ำสุดและสูงสุดต้องเป็นเลขจำนวนเต็ม และต่ำสุดไม่เกินสูงสุด`;
      }
    }
    if (c.type === "list") {
      const opts = c.options ?? [];
      if (opts.length < 1 || opts.length > 50 || opts.some((o) => !o.trim() || o.length > 100) || new Set(opts).size !== opts.length) {
        return `${name}: รายการให้เลือกต้องมี 1 ถึง 50 รายการ ไม่ว่าง ไม่ซ้ำ`;
      }
    }
    if ((c.help_title ?? "").length > 32 || (c.error_title ?? "").length > 32 || (c.header_help_title ?? "").length > 32) {
      return `${name}: หัวข้อคำแนะนำยาวเกิน 32 ตัวอักษร (ข้อจำกัดของ Excel)`;
    }
    if ((c.help ?? "").length > 255 || (c.error ?? "").length > 255 || (c.header_help ?? "").length > 255) {
      return `${name}: คำแนะนำยาวเกิน 255 ตัวอักษร (ข้อจำกัดของ Excel)`;
    }
    if ((c.example ?? "").length > 200) return `${name}: ตัวอย่างยาวเกิน 200 ตัวอักษร`;
  }
  return null;
}

export function sheetNameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length < 1 || n.length > 31 || SHEET_NAME_BAD.test(n)) {
    return "ชื่อแผ่นงานต้องยาว 1-31 ตัวอักษร และห้ามมีเครื่องหมาย [ ] : * ? / \\";
  }
  return null;
}

/** ชื่อไฟล์แม่แบบ เช่น ศ.๑-นักธรรมชั้นตรี-2569-สนามสอบวัดหนึ่ง.xlsx (ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้) */
export function templateFileName(t: Pick<FormTemplate, "code" | "exam_type" | "level">, parts: (string | number | null | undefined)[]) {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return [t.code, examName(t.exam_type, t.level), ...parts]
    .filter((p) => p !== null && p !== undefined && String(p).trim() !== "")
    .map((p) => clean(String(p)))
    .join("-")
    .slice(0, 150)
    .concat(".xlsx");
}

/** ป้ายแท็กแคชของหน้าสาธารณะ ดาวน์โหลด (ล้างเมื่อผู้ดูแลระบบแก้แบบฟอร์มหรือรายการคำนำหน้า) */
export const FORMS_TAG = "exam-forms";
