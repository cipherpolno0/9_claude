/** ตรวจรายชื่อและพิมพ์บัญชี ศ. (บทที่ 20): ชนิดข้อมูลและตัวช่วยที่ใช้ได้ทั้งหน้าจอและเซิร์ฟเวอร์ */

import type { BatchStatus } from "@/lib/exam-batches";
import type { ExamLevel, ExamType, FormColumn, FormTemplate, HeaderCell, SignatureSlot } from "@/lib/exam-forms";
import { regionNoFromName } from "@/lib/exam-forms";

export type { SignatureSlot };
export const MAX_SIGNATURES = 6;
export const MAX_SIGNATURE_LINES = 5;
export const MAX_SIGNATURE_LENGTH = 300;

/** ตรวจช่องลงนาม (ตรงกับ private.form_signatures_ok ในฐานข้อมูล) คืนข้อความผิดข้อแรก หรือ null */
export function signaturesProblem(slots: SignatureSlot[]): string | null {
  if (slots.length > MAX_SIGNATURES) return `ช่องลงนามมีได้ไม่เกิน ${MAX_SIGNATURES} ช่อง`;
  for (const [i, s] of slots.entries()) {
    const text = s.text ?? "";
    if (!text.trim() || text.length > MAX_SIGNATURE_LENGTH) {
      return `ช่องลงนามที่ ${i + 1}: กรุณากรอกข้อความ (ไม่เกิน ${MAX_SIGNATURE_LENGTH} ตัวอักษร)`;
    }
    if (text.split("\n").length > MAX_SIGNATURE_LINES) return `ช่องลงนามที่ ${i + 1}: ไม่เกิน ${MAX_SIGNATURE_LINES} บรรทัด`;
  }
  return null;
}

/** แบบ ศ. ที่ทำบัญชีรายชื่อได้ในบทนี้ (ยังไม่มีแบบ ศ.๓: ผู้สั่งงานให้ทำ ศ.๑ ๒ ๕ ๖ ก่อน) */
export type ListForm = Pick<FormTemplate, "id" | "code" | "exam_type" | "level" | "title" | "header_cells" | "columns"> & {
  signatures: SignatureSlot[];
};

/** รหัสแบบในที่อยู่หน้าเว็บ เช่น nak_tham-tri */
export const formParam = (t: Pick<FormTemplate, "exam_type" | "level">) => `${t.exam_type}-${t.level}`;

export type ListOption = { kind: "venue" | "place"; id: string; code: string; name: string; candidates: number; accounts: number };

/** หนึ่งแถวของบัญชีรายชื่อ (registration_list) ไม่มีเลขประจำตัวเต็ม */
export type ListRow = {
  venue_id: string;
  venue_code: string;
  venue_name: string;
  venue_subdistrict: string | null;
  venue_district: string | null;
  venue_province: string | null;
  region_name: string | null;
  place_id: string;
  place_code: string;
  place_name: string;
  batch_id: string;
  batch_status: BatchStatus;
  request_no: string | null;
  candidate_id: string;
  candidate_code: string | null;
  national_id_last4: string | null;
  id_kind: "nid" | "other" | "none";
  vals: Record<string, string>;
};

export type VenueSection = {
  venue_id: string;
  venue_code: string;
  venue_name: string;
  subdistrict: string;
  district: string;
  province: string;
  region_name: string;
  places: { name: string; count: number; request_no: string | null; status: BatchStatus }[];
  rows: ListRow[];
};

/** แบ่งแถวตามสนามสอบ (หนึ่งสนาม = หนึ่งบัญชีตามแบบ: ๑ สนามสอบ ๑ ชั้น ๑ แฟ้ม) */
export function groupByVenue(rows: ListRow[]): VenueSection[] {
  const map = new Map<string, VenueSection>();
  for (const r of rows) {
    let s = map.get(r.venue_id);
    if (!s) {
      s = {
        venue_id: r.venue_id,
        venue_code: r.venue_code,
        venue_name: r.venue_name,
        subdistrict: r.venue_subdistrict ?? "",
        district: r.venue_district ?? "",
        province: r.venue_province ?? "",
        region_name: r.region_name ?? "",
        places: [],
        rows: [],
      };
      map.set(r.venue_id, s);
    }
    s.rows.push(r);
    const last = s.places[s.places.length - 1];
    if (last && last.name === r.place_name && last.request_no === r.request_no) last.count += 1;
    else s.places.push({ name: r.place_name, count: 1, request_no: r.request_no, status: r.batch_status });
  }
  return [...map.values()];
}

/** ค่าของหัวแฟ้ม (แถว 4-5 ของแบบ) จากสนามสอบและปี */
export function headerFieldValue(cell: HeaderCell, section: Pick<VenueSection, "venue_code" | "venue_name" | "subdistrict" | "district" | "province" | "region_name">, yearBe: number): string {
  switch (cell.field) {
    case "year_be":
      return String(yearBe);
    case "venue_code":
      return section.venue_code;
    case "venue_name":
      return section.venue_name;
    case "venue_subdistrict":
      return section.subdistrict;
    case "venue_district":
      return section.district;
    case "venue_province":
      return section.province;
    case "region_no": {
      const n = regionNoFromName(section.region_name);
      return n ? String(n) : "";
    }
    default:
      return "";
  }
}

/** แถวของหัวแฟ้มตามตำแหน่งช่อง (เช่น A4 = แถว 4) เรียงตามคอลัมน์ */
export function headerLines(cells: HeaderCell[]): HeaderCell[][] {
  const rows = new Map<number, HeaderCell[]>();
  for (const c of cells) {
    const m = c.cell.match(/^([A-Z]+)(\d+)$/);
    if (!m) continue;
    const r = Number(m[2]);
    rows.set(r, [...(rows.get(r) ?? []), c]);
  }
  const colNo = (cell: string) => [...(cell.match(/^[A-Z]+/)?.[0] ?? "A")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list.sort((a, b) => colNo(a.cell) - colNo(b.cell)));
}

/** หัวตาราง 2 บรรทัดตามแบบ (กติกาเดียวกับแม่แบบ Excel: รวมแนวนอนตาม top_span รวมแนวตั้งเมื่อมีแต่บรรทัดบน) */
export type HeadCell = { key: string; text: string; colSpan: number; rowSpan: number };
export function columnHeadRows(columns: FormColumn[]): [HeadCell[], HeadCell[]] {
  const top: HeadCell[] = [];
  const bottom: HeadCell[] = [];
  let coveredUntil = -1;
  columns.forEach((col, i) => {
    if (i > coveredUntil) {
      if (col.top_span > 1) {
        top.push({ key: col.key, text: col.top, colSpan: col.top_span, rowSpan: 1 });
        coveredUntil = i + col.top_span - 1;
        bottom.push({ key: col.key, text: col.bottom, colSpan: 1, rowSpan: 1 });
        return;
      }
      if (!col.bottom) {
        top.push({ key: col.key, text: col.top, colSpan: 1, rowSpan: 2 });
        return;
      }
      top.push({ key: col.key, text: col.top, colSpan: 1, rowSpan: 1 });
    }
    bottom.push({ key: col.key, text: col.bottom, colSpan: 1, rowSpan: 1 });
  });
  return [top, bottom];
}

/** ข้อความในช่องของบัญชี: วันที่เป็น วว/ดด/ปปปป พ.ศ. เลขประจำตัวปิดไว้เหลือ 4 ตัวท้าย เลขที่ = ลำดับในบัญชีที่พิมพ์ */
export function cellText(col: FormColumn, row: ListRow, seq: number): string {
  if (col.key === "seq") return String(seq);
  if (col.type === "id" || col.key === "national_id") {
    if (!row.national_id_last4) return "";
    return row.id_kind === "nid" ? `xxxxxxxxx${row.national_id_last4}` : `xxxx${row.national_id_last4}`;
  }
  const v = row.vals[col.key] ?? "";
  if (col.type === "date") {
    // แบบเดียวกับที่แบบ ศ. แนะนำให้กรอก เช่น 1/1/2540
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${Number(m[3])}/${Number(m[2])}/${Number(m[1]) + 543}` : v;
  }
  return v;
}

// ---------------------------------------------------------------
// ตรวจสอบรายบุคคล (เจ้าหน้าที่)
// ---------------------------------------------------------------
export type PersonRow = {
  person_ref: string;
  matched: boolean;
  candidate_id: string;
  batch_id: string;
  year_be: number;
  exam_type: ExamType;
  level: ExamLevel;
  form_code: string;
  stage: string;
  candidate_code: string | null;
  cand_status: "ok" | "withdrawn";
  batch_status: BatchStatus;
  request_no: string | null;
  title: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  national_id_last4: string | null;
  birth_date: string | null;
  place_name: string;
  venue_code: string;
  venue_name: string;
  unit_name: string;
  withdraw_reason: string;
};

export type PersonGroup = { ref: string; rows: PersonRow[] };

/** รวมแถวเป็นรายบุคคล (บุคคลเดียวกัน = เลขประจำตัวเดียวกัน หรือ ชื่อ นามสกุล วันเกิด ตรงกัน) */
export function groupPeople(rows: PersonRow[]): PersonGroup[] {
  const map = new Map<string, PersonRow[]>();
  for (const r of rows) map.set(r.person_ref, [...(map.get(r.person_ref) ?? []), r]);
  return [...map.entries()].map(([ref, list]) => ({ ref, rows: list.sort((a, b) => b.year_be - a.year_be) }));
}

/** เลข 13 หลัก หรือเลขอื่น 5-20 ตัว (ตัดช่องว่างและขีด) */
export const looksLikeId = (q: string) => /^[0-9A-Za-z]{5,20}$/.test(q.replace(/[\s-]/g, "")) && /\d{5,}/.test(q.replace(/[\s-]/g, ""));

// ---------------------------------------------------------------
// รายงาน
// ---------------------------------------------------------------
export type ReportCountRow = {
  unit_id: string;
  unit_name: string;
  unit_code: string;
  is_self: boolean;
  exam_type: ExamType;
  level: ExamLevel;
  form_code: string;
  candidates: number;
  accounts: number;
};

export type DuplicateRow = {
  person_ref: string;
  candidate_id: string;
  batch_id: string;
  exam_type: ExamType;
  level: ExamLevel;
  form_code: string;
  candidate_code: string | null;
  title: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  national_id_last4: string | null;
  birth_date: string | null;
  place_name: string;
  venue_name: string;
  unit_name: string;
  batch_status: BatchStatus;
  hidden_count: number;
};

export const LIST_REPORT_KINDS = ["counts", "duplicates"] as const;
export type ListReportKind = (typeof LIST_REPORT_KINDS)[number];
export const LIST_REPORT_LABEL: Record<ListReportKind, string> = {
  counts: "จำนวนผู้สมัครต่อแบบ ศ. ต่อเขต",
  duplicates: "รายชื่อที่สมัครซ้ำข้ามสำนัก",
};
export const isListReportKind = (v: unknown): v is ListReportKind =>
  typeof v === "string" && (LIST_REPORT_KINDS as readonly string[]).includes(v);

// ---------------------------------------------------------------
// ตรวจรายชื่อผู้ขอเข้าสอบ (สาธารณะ)
// ---------------------------------------------------------------
export const PUBLIC_CHECK_LIMIT = 20;
export const PUBLIC_CHECK_PER_MINUTE = 10;

export type PublicCheckRow = {
  title: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  year_be: number;
  exam_type: ExamType;
  level: ExamLevel;
  stage: string;
  place_name: string;
  venue_name: string;
  certified: boolean;
};

export type PublicCheckResult =
  | { ok: true; total: number; rows: PublicCheckRow[] }
  | { ok: false; error: string; limited?: boolean };

/** ทำความสะอาดคำค้นสาธารณะ และตรวจว่ากรอกอย่างน้อย 2 ช่อง (ตรงกับ public_registration_search) */
export function checkPublicQuery(input: { first: string; last: string; year: string }):
  | { ok: true; first: string; last: string; year: number | null }
  | { ok: false; error: string } {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const first = clean(input.first ?? "");
  const last = clean(input.last ?? "");
  const yearText = (input.year ?? "").trim().replace(/[๐-๙]/g, (d) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)));
  const filled = [first, last, yearText].filter(Boolean).length;
  if (filled < 2) return { ok: false, error: "กรุณากรอกอย่างน้อย 2 ช่อง จาก ชื่อ นามสกุลหรือฉายา และปี พ.ศ." };
  if ((first && first.length < 2) || (last && last.length < 2) || first.length > 100 || last.length > 100) {
    return { ok: false, error: "ชื่อและนามสกุลต้องยาวอย่างน้อย 2 ตัวอักษร" };
  }
  let year: number | null = null;
  if (yearText) {
    if (!/^\d{4}$/.test(yearText) || Number(yearText) < 2500 || Number(yearText) > 2700) {
      return { ok: false, error: "ปี พ.ศ. ต้องเป็นตัวเลข 4 หลัก เช่น 2569" };
    }
    year = Number(yearText);
  }
  return { ok: true, first, last, year };
}
