/** ชนิดรายงานบุคลากร ปีงบประมาณ และป้ายสีสถานะ ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */

export const REPORT_KINDS = ["directory", "vacancies", "education", "status"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_LABEL: Record<ReportKind, string> = {
  directory: "ทำเนียบตามเขต",
  vacancies: "ตำแหน่งว่าง",
  education: "จศป. แยกแท่งและเขต",
  status: "สรุปการเปลี่ยนสถานะรายปี",
};

export const REPORT_DESCRIPTION: Record<ReportKind, string> = {
  directory: "ผู้ดำรงตำแหน่งปกครองปัจจุบันของทุกหน่วยในเขตที่เลือก",
  vacancies: "ตำแหน่งปกครองที่ยังไม่มีผู้ดำรง หรือมีน้อยกว่าจำนวนที่ตั้งไว้",
  education: "จำนวน จศป. ที่ปฏิบัติหน้าที่อยู่ แยกตามแท่ง นับรวมหน่วยใต้สังกัดของแต่ละเขต",
  status: "จำนวนการย้าย ลาออก มรณภาพ-ตาย ลาสิกขา และพ้นตำแหน่งด้วยเหตุอื่น นับตามปีงบประมาณ",
};

export const isReportKind = (value: unknown): value is ReportKind =>
  (REPORT_KINDS as readonly string[]).includes(String(value));

/** ปีงบประมาณ (พ.ศ.) ของวันที่: ปีงบประมาณ 2570 = 1 ต.ค. 2569 ถึง 30 ก.ย. 2570 (ตรงกับ fiscal_year_be ในฐานข้อมูล) */
export function fiscalYearOf(iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  return y + 543 + (m >= 10 ? 1 : 0);
}

export function fiscalYearRange(year: number): string {
  return `1 ต.ค. ${year - 1} – 30 ก.ย. ${year}`;
}

/** สีของป้ายสถานะบุคคล (ใช้ในหน้าตรวจสอบและทำเนียบสาธารณะ) */
export const STATUS_BADGE_CLASS: Record<string, string> = {
  active: "border-green-300 bg-green-100 text-green-900",
  transfer_pending: "border-amber-400 bg-amber-100 text-amber-900",
  transferred: "border-sky-300 bg-sky-100 text-sky-900",
  resigned: "border-stone-300 bg-stone-200 text-stone-800",
  deceased: "border-neutral-700 bg-neutral-700 text-white",
  disrobed: "border-purple-300 bg-purple-100 text-purple-900",
  removed_other: "border-red-300 bg-red-100 text-red-900",
};

/** ตารางรายงานแบบกลาง: ใช้ทั้งแสดงบนจอ ส่งออก Excel และหน้าพิมพ์ */
export type ReportColumn = {
  header: string;
  width?: number;
  align?: "left" | "center" | "right";
  /** money = จำนวนเงิน 2 ตำแหน่ง / percent = ร้อยละ (ค่าในแถวเป็นตัวเลข แปลงเป็นข้อความตอนแสดงผล Excel ใช้รูปแบบตัวเลข) */
  format?: "money" | "percent";
};

/** แสดงค่าของช่องตามรูปแบบคอลัมน์ (บนจอและหน้าพิมพ์) */
export function reportCell(column: ReportColumn | undefined, value: string | number | undefined): string | number | undefined {
  if (typeof value !== "number" || !column?.format) return value;
  const text = value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return column.format === "percent" ? `${text}%` : text;
}
export type ReportTable = {
  /** ชนิดรายงาน (รายงานบุคลากรใช้ ReportKind ระบบอื่นใช้ชื่อของตน) */
  kind: ReportKind | (string & {});
  title: string;
  subtitle: string;
  note?: string;
  columns: ReportColumn[];
  rows: (string | number)[][];
  /**
   * ลำดับคอลัมน์ที่ใช้แบ่งกลุ่ม (ไม่บังคับ) เช่น จังหวัด: บนจอและหน้าพิมพ์จะแสดงเป็นหัวกลุ่มแทนคอลัมน์
   * ส่วนไฟล์ Excel ยังคงเป็นคอลัมน์ตามปกติ แถวต้องเรียงตามคอลัมน์นี้มาแล้ว
   */
  groupColumn?: number;
  /** แถวสรุปท้ายตาราง (ถ้ามี) */
  footer?: (string | number)[];
  /** ลิงก์ของแต่ละแถว (เปิดจากช่องแรกที่แสดง ใช้บนจอเท่านั้น) เช่น เจาะดูรายงานของหน่วยใต้สังกัด */
  rowLinks?: (string | null)[];
};

export type GovernanceSlot = {
  unit_id: string;
  parent_id: string | null;
  unit_level: string;
  unit_name: string;
  unit_code: string;
  sect: string | null;
  position_key: string;
  position_name: string;
  kind: "chief" | "deputy" | "secretary";
  sort_order: number;
  max_per_unit: number | null;
  held: number;
  holders: string;
  missing: number;
};

export type ViewRoot = { id: string; name: string; code: string; level: string; sect: string | null };
