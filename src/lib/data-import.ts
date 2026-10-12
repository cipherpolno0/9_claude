/**
 * นำเข้าข้อมูลจริงตอนขึ้นใช้งาน (บทที่ 32) ลำดับ: เขตปกครอง > สถานที่ > บุคคลและตำแหน่ง > สนามสอบ > ผู้ใช้
 * ไฟล์นี้มีเฉพาะหัวคอลัมน์และการตรวจรูปแบบ (ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ) กติกาที่ต้องอ่านฐานข้อมูลตรวจในฟังก์ชัน
 * import_appointments / import_venues และใน Server Action ของผู้ใช้
 */
import { cleanNationalId, parseImportDate, validNationalId } from "@/lib/persons";

export const IMPORT_MAX_ROWS = 2000;
/** สร้างบัญชีผู้ใช้ทีละไม่เกินเท่านี้ เพราะต้องเรียกระบบบัญชีทีละคน */
export const USER_IMPORT_MAX_ROWS = 300;

export const APPOINTMENT_IMPORT_HEADERS = [
  "เลขประจำตัวประชาชน",
  "ชื่อ",
  "ฉายา",
  "นามสกุล",
  "ตำแหน่ง",
  "รหัสเขตปกครอง",
  "วันแต่งตั้ง",
  "เลขที่คำสั่ง",
] as const;

export const VENUE_IMPORT_HEADERS = [
  "รหัสสนามสอบ",
  "ชื่อสนามสอบ",
  "ประเภท",
  "ชั้นที่เปิดสอบ",
  "รหัสสถานที่ตั้ง",
  "จำนวนผู้เข้าสอบโดยประมาณ",
  "ปีการศึกษาที่เริ่ม",
  "หมายเหตุ",
] as const;

export const USER_IMPORT_HEADERS = [
  "อีเมล",
  "คำนำหน้า",
  "ชื่อ",
  "ฉายา",
  "นามสกุล",
  "เบอร์ติดต่อ",
  "บทบาท",
  "รหัสเขตปกครอง",
] as const;

export type RawRow = { rowNumber: number; cells: string[] };
export type CheckedRow<T> = {
  rowNumber: number;
  cells: string[];
  status: "new" | "skip" | "error";
  message: string;
  data: T | null;
};

const cell = (r: RawRow, i: number) => (r.cells[i] ?? "").trim();

// ------------------------------------------------------------------
// ตำแหน่ง
// ------------------------------------------------------------------
export type AppointmentImportData = {
  row_number: number;
  national_id: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  position_name: string;
  unit_code: string;
  appointed_on: string;
  order_no: string;
};

export function validateAppointmentRows(rows: RawRow[]): CheckedRow<AppointmentImportData>[] {
  return rows.map((r) => {
    const problems: string[] = [];
    const nid = cleanNationalId(cell(r, 0));
    if (nid && !validNationalId(nid)) problems.push("เลขประจำตัวประชาชนไม่ถูกต้อง");
    if (!nid && !cell(r, 1)) problems.push("กรอกเลขประจำตัวประชาชน หรือ ชื่อ");
    if (!cell(r, 4)) problems.push("กรอกตำแหน่ง");
    if (!cell(r, 5)) problems.push("กรอกรหัสเขตปกครอง");
    const date = parseImportDate(cell(r, 6));
    if (date === null) problems.push("กรอกวันแต่งตั้ง");
    else if (date === "invalid") problems.push("วันแต่งตั้งต้องเป็น วว/ดด/ปปปป (พ.ศ.)");
    if (cell(r, 7).length > 200) problems.push("เลขที่คำสั่งยาวเกิน 200 ตัวอักษร");
    if (problems.length) return { ...r, status: "error", message: problems.join(" / "), data: null };
    return {
      ...r,
      status: "new",
      message: "",
      data: {
        row_number: r.rowNumber,
        national_id: nid,
        first_name: cell(r, 1),
        monastic_name: cell(r, 2),
        last_name: cell(r, 3),
        position_name: cell(r, 4),
        unit_code: cell(r, 5),
        appointed_on: date as string,
        order_no: cell(r, 7),
      },
    };
  });
}

// ------------------------------------------------------------------
// สนามสอบ
// ------------------------------------------------------------------
export type VenueImportData = {
  row_number: number;
  code: string;
  name: string;
  venue_type: "nak_tham" | "tham_sueksa";
  levels: string[];
  place_code: string;
  capacity: number | null;
  start_year_be: number | null;
  note: string;
};

const VENUE_TYPE_BY_TEXT: Record<string, "nak_tham" | "tham_sueksa"> = {
  นักธรรม: "nak_tham",
  nak_tham: "nak_tham",
  ธรรมศึกษา: "tham_sueksa",
  tham_sueksa: "tham_sueksa",
};
const LEVEL_BY_TEXT: Record<string, string> = { ตรี: "tri", โท: "tho", เอก: "ek", tri: "tri", tho: "tho", ek: "ek" };

export function validateVenueRows(rows: RawRow[]): CheckedRow<VenueImportData>[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const problems: string[] = [];
    const code = cell(r, 0);
    if (!code) problems.push("กรอกรหัสสนามสอบ");
    else if (seen.has(code)) problems.push(`รหัสซ้ำกับแถว ${seen.get(code)}`);
    else seen.set(code, r.rowNumber);
    if (!cell(r, 1)) problems.push("กรอกชื่อสนามสอบ");
    const type = VENUE_TYPE_BY_TEXT[cell(r, 2)];
    if (!type) problems.push("ประเภทต้องเป็น นักธรรม หรือ ธรรมศึกษา");
    const parts = cell(r, 3).split(/[\s,]+/).filter(Boolean);
    const levels = [...new Set(parts.map((p) => LEVEL_BY_TEXT[p]))];
    if (parts.length === 0 || levels.some((l) => !l)) problems.push("ชั้นที่เปิดสอบต้องเป็น ตรี โท เอก (คั่นด้วยจุลภาค)");
    if (!cell(r, 4)) problems.push("กรอกรหัสสถานที่ตั้ง");
    const capText = cell(r, 5).replace(/,/g, "");
    const capacity = capText ? Number(capText) : null;
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0 || capacity > 100000)) {
      problems.push("จำนวนผู้เข้าสอบต้องเป็นจำนวนเต็ม 0 ถึง 100,000");
    }
    const yearText = cell(r, 6);
    const year = yearText ? Number(yearText) : null;
    if (year !== null && (!Number.isInteger(year) || year < 2400 || year > 2700)) problems.push("ปีการศึกษาต้องเป็นปี พ.ศ. 4 หลัก");
    if (cell(r, 7).length > 500) problems.push("หมายเหตุยาวเกิน 500 ตัวอักษร");
    if (problems.length) return { ...r, status: "error", message: problems.join(" / "), data: null };
    return {
      ...r,
      status: "new",
      message: "",
      data: {
        row_number: r.rowNumber,
        code,
        name: cell(r, 1),
        venue_type: type,
        levels: levels as string[],
        place_code: cell(r, 4),
        capacity,
        start_year_be: year,
        note: cell(r, 7),
      },
    };
  });
}

// ------------------------------------------------------------------
// ผู้ใช้
// ------------------------------------------------------------------
export type UserImportData = {
  row_number: number;
  email: string;
  title_prefix: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  phone: string;
  role_key: string;
  unit_code: string;
};

/** roles = รายการบทบาทในฐานข้อมูล (รับทั้งรหัสและชื่อ) */
export function validateUserRows(
  rows: RawRow[],
  roles: { key: string; name: string; requires_org_unit: boolean }[],
): CheckedRow<UserImportData>[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const problems: string[] = [];
    const email = cell(r, 0).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push("รูปแบบอีเมลไม่ถูกต้อง");
    else if (seen.has(email)) problems.push(`อีเมลซ้ำกับแถว ${seen.get(email)}`);
    else seen.set(email, r.rowNumber);
    if (!cell(r, 2)) problems.push("กรอกชื่อ");
    const roleText = cell(r, 6);
    const role = roles.find((x) => x.key === roleText || x.name === roleText);
    if (!role) problems.push("ไม่พบบทบาทนี้");
    else if (role.requires_org_unit && !cell(r, 7)) problems.push(`บทบาท ${role.name} ต้องกรอกรหัสเขตปกครอง`);
    if (cell(r, 5).length > 50) problems.push("เบอร์ติดต่อยาวเกิน 50 ตัวอักษร");
    if (problems.length) return { ...r, status: "error", message: problems.join(" / "), data: null };
    return {
      ...r,
      status: "new",
      message: "",
      data: {
        row_number: r.rowNumber,
        email,
        title_prefix: cell(r, 1),
        first_name: cell(r, 2),
        monastic_name: cell(r, 3),
        last_name: cell(r, 4),
        phone: cell(r, 5),
        role_key: role!.key,
        unit_code: role!.requires_org_unit ? cell(r, 7) : "",
      },
    };
  });
}

/** ข้อความจากฐานข้อมูลที่เป็นภาษาอังกฤษ (ชื่อ constraint) แปลงเป็นภาษาไทยเท่าที่ทราบ */
export function friendlyRowMessage(message: string): string {
  if (/exam_venues_levels_check/.test(message)) return "ชั้นที่เปิดสอบไม่ถูกต้อง";
  if (/exam_venues_capacity_check/.test(message)) return "จำนวนผู้เข้าสอบไม่ถูกต้อง";
  if (/exam_venues_start_year_be_check/.test(message)) return "ปีการศึกษาที่เริ่มไม่ถูกต้อง";
  if (/duplicate key value/.test(message)) return "ข้อมูลซ้ำกับที่มีอยู่แล้ว";
  if (/row-level security|permission denied/.test(message)) return "ท่านไม่มีสิทธิ์บันทึกรายการนี้ (นอกเขตที่ดูแล)";
  return message;
}

/** ขั้นตอนนำเข้าตามลำดับ (หน้า /app/admin/data-import) */
export const IMPORT_STEPS = [
  { key: "units", title: "เขตปกครอง", detail: "เขตปกครองคณะสงฆ์ (ส่วนกลาง ภาค จังหวัด อำเภอ ตำบล) และเขตการปกครองบ้านเมือง" },
  { key: "places", title: "สถานที่", detail: "วัด สำนักเรียน สำนักศาสนศึกษา สถานศึกษา องค์กร (นำเข้าวัดก่อนสำนัก)" },
  { key: "persons", title: "บุคคลและตำแหน่ง", detail: "ทะเบียนบุคคล แล้วจึงนำเข้าตำแหน่ง (วาระ) ของแต่ละคน" },
  { key: "venues", title: "สนามสอบ", detail: "สนามสอบนักธรรมและธรรมศึกษา ผูกกับรหัสสถานที่ตั้ง" },
  { key: "users", title: "ผู้ใช้", detail: "บัญชีผู้ใช้พร้อมบทบาทและเขตปกครอง ผู้ใช้ตั้งรหัสผ่านเองทางอีเมล" },
] as const;
