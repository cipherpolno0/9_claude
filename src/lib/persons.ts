/** ชนิดข้อมูล ป้ายชื่อ และกติกาของทะเบียนบุคคล ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */

export const PERSON_TYPES = ["monastic", "lay"] as const;
export type PersonType = (typeof PERSON_TYPES)[number];
export const PERSON_TYPE_LABEL: Record<PersonType, string> = { monastic: "บรรพชิต", lay: "คฤหัสถ์" };

export const PERSON_STATUSES = ["active", "disrobed", "deceased", "moved_out"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];
export const PERSON_STATUS_LABEL: Record<PersonStatus, string> = {
  active: "ปกติ",
  disrobed: "ลาสิกขา",
  deceased: "มรณภาพ",
  moved_out: "ย้ายออกนอกเขต",
};

export const NAK_THAM = ["tri", "tho", "ek"] as const;
export const NAK_THAM_LABEL: Record<string, string> = { tri: "น.ธ.ตรี", tho: "น.ธ.โท", ek: "น.ธ.เอก" };

export const PALI_GRADES = ["p12", "p3", "p4", "p5", "p6", "p7", "p8", "p9"] as const;
export const PALI_LABEL: Record<string, string> = {
  p12: "ประโยค 1-2",
  p3: "ป.ธ.3",
  p4: "ป.ธ.4",
  p5: "ป.ธ.5",
  p6: "ป.ธ.6",
  p7: "ป.ธ.7",
  p8: "ป.ธ.8",
  p9: "ป.ธ.9",
};

export const END_REASONS = ["term_ended", "resigned", "transferred", "removed", "disrobed", "deceased", "other"] as const;
export type EndReason = (typeof END_REASONS)[number];
export const END_REASON_LABEL: Record<EndReason, string> = {
  term_ended: "ครบวาระ",
  resigned: "ลาออก",
  transferred: "ย้ายหรือเลื่อนตำแหน่ง",
  removed: "ถูกถอดถอน",
  disrobed: "ลาสิกขา",
  deceased: "มรณภาพ",
  other: "อื่น ๆ (ระบุ)",
};

/** คอลัมน์ของ persons ที่อ่านผ่าน API ได้ (คอลัมน์ที่เข้ารหัสไม่เปิดให้อ่าน) */
export const PERSON_COLUMNS =
  "id, person_type, title, first_name, monastic_name, last_name, birth_date, national_id_last4, ordination_date, nak_tham, pali_grade, general_education, temple_name, org_unit_id, phone, status, note, is_active, user_id, created_at, updated_at";

export type Person = {
  id: string;
  person_type: PersonType;
  title: string;
  first_name: string;
  monastic_name: string;
  last_name: string;
  birth_date: string | null;
  national_id_last4: string | null;
  ordination_date: string | null;
  nak_tham: string;
  pali_grade: string;
  general_education: string;
  temple_name: string;
  org_unit_id: string;
  phone: string;
  status: PersonStatus;
  note: string;
  is_active: boolean;
  user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PositionType = {
  key: string;
  name: string;
  kind: "chief" | "deputy" | "secretary";
  level: "region" | "province" | "district" | "subdistrict";
  max_per_unit: number | null;
  sort_order: number;
  is_active: boolean;
};

export type Appointment = {
  id: string;
  person_id: string;
  position_type_key: string;
  org_unit_id: string;
  appointed_on: string;
  order_no: string;
  ended_on: string | null;
  end_reason: EndReason | null;
  end_note: string;
  is_active: boolean;
  position_name: string;
  org_unit_name: string;
};

export function personName(p: Pick<Person, "title" | "first_name" | "monastic_name" | "last_name">): string {
  return [p.title, p.first_name, p.monastic_name, p.last_name].filter(Boolean).join(" ").trim();
}

/** วันนี้ตามเวลาประเทศไทย ในรูป YYYY-MM-DD */
export function todayIso(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

/**
 * พรรษา (คำนวณโดยประมาณ ไม่เก็บในฐานข้อมูล)
 * นับ 1 พรรษาต่อปีที่อุปสมบทก่อนเข้าพรรษา (ถือ 1 สิงหาคม) และพ้นวันออกพรรษาของปีนั้นแล้ว (ถือ 1 พฤศจิกายน)
 * วันเข้า-ออกพรรษาจริงเป็นวันทางจันทรคติ จึงอาจคลาดได้ 1 พรรษาในช่วง ก.ค.-ต.ค. ของบางปี
 */
export function phansaOf(ordinationDate: string | null, today: string = todayIso()): number | null {
  if (!ordinationDate) return null;
  const [oy, om] = ordinationDate.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  if (!oy || !ty) return null;
  const first = om < 8 ? oy : oy + 1;
  const last = tm >= 11 ? ty : ty - 1;
  return Math.max(0, last - first + 1);
}

/** อายุเต็มปี */
export function ageOf(birthDate: string | null, today: string = todayIso()): number | null {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 ? age : null;
}

/** ตรวจเลขประจำตัวประชาชน 13 หลัก (รวมหลักตรวจสอบ) */
export function validNationalId(value: string): boolean {
  if (!/^[0-9]{13}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(value[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(value[12]);
}

export function cleanNationalId(value: string): string {
  return value.replace(/[\s-]/g, "");
}

/** วิทยฐานะแบบย่อ เช่น "น.ธ.เอก, ป.ธ.3" */
export function educationText(p: Pick<Person, "nak_tham" | "pali_grade" | "general_education">): string {
  return [NAK_THAM_LABEL[p.nak_tham], PALI_LABEL[p.pali_grade], p.general_education].filter(Boolean).join(", ");
}

/** วาระนี้ยังดำรงตำแหน่งอยู่ในวันนี้หรือไม่ */
export function isCurrentAppointment(
  a: Pick<Appointment, "appointed_on" | "ended_on" | "is_active">,
  today: string = todayIso(),
): boolean {
  return a.is_active && a.appointed_on <= today && (a.ended_on === null || a.ended_on > today);
}

/** ชื่อช่องภาษาไทย สำหรับแสดงประวัติการแก้ไข */
export const PERSON_FIELD_LABEL: Record<string, string> = {
  person_type: "ประเภท",
  title: "คำนำหน้าหรือสมณศักดิ์",
  first_name: "ชื่อ",
  monastic_name: "ฉายา",
  last_name: "นามสกุล",
  birth_date: "วันเกิด",
  national_id_last4: "เลขประจำตัวประชาชน (4 ตัวท้าย)",
  ordination_date: "วันอุปสมบท",
  nak_tham: "น.ธ.",
  pali_grade: "ป.ธ.",
  general_education: "วุฒิสามัญ",
  temple_name: "วัดที่สังกัด",
  org_unit_id: "เขตปกครอง",
  phone: "เบอร์ติดต่อ",
  status: "สถานะ",
  note: "หมายเหตุ",
  is_active: "การใช้งาน",
  position_type_key: "ตำแหน่ง",
  appointed_on: "วันที่แต่งตั้ง",
  order_no: "เลขที่คำสั่งหรือตราตั้ง",
  ended_on: "วันพ้นตำแหน่ง",
  end_reason: "เหตุที่พ้น",
  end_note: "รายละเอียดเหตุที่พ้น",
  person_id: "บุคคล",
  user_id: "บัญชีผู้ใช้ที่ผูก",
  track: "แท่ง",
  position_type_id: "ประเภทตำแหน่ง",
  school_name: "สำนักที่ปฏิบัติหน้าที่",
  school_type: "ประเภทสำนัก",
  started_on: "วันที่เริ่ม",
  subjects: "วิชาที่สอน",
};

/** ช่องที่เจ้าของประวัติขอแก้ไขได้ผ่านคำขอแก้ไขประวัติ (ต้องตรงกับฟังก์ชัน clean_profile_changes ในฐานข้อมูล) */
export const PROFILE_EDIT_FIELDS = [
  "title",
  "first_name",
  "monastic_name",
  "last_name",
  "birth_date",
  "ordination_date",
  "nak_tham",
  "pali_grade",
  "general_education",
  "temple_name",
  "phone",
] as const;
export type ProfileEditField = (typeof PROFILE_EDIT_FIELDS)[number];

// ------------------------------------------------------------------
// วันที่: แปลงระหว่างข้อความ วว/ดด/ปปปป (พ.ศ.) กับ YYYY-MM-DD
// ------------------------------------------------------------------

function isoIfReal(y: number, m: number, d: number): string | null {
  if (y < 1800 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * อ่านวันที่จากไฟล์ Excel: รับ วว/ดด/ปปปป หรือ ปปปป-ดด-วว  ปีตั้งแต่ 2400 ขึ้นไปถือเป็น พ.ศ.
 * คืน null ถ้าว่าง คืน "invalid" ถ้าอ่านไม่ได้
 */
export function parseImportDate(text: string): string | null | "invalid" {
  const t = text.trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const ymd = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else if (ymd) [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  else return "invalid";
  if (y >= 2400) y -= 543;
  return isoIfReal(y, m, d) ?? "invalid";
}

/** ประกอบวันที่จาก วัน เดือน ปี พ.ศ. (ใช้กับช่องกรอกวันที่) */
export function isoFromThaiParts(day: number, month: number, yearBe: number): string | null {
  return isoIfReal(yearBe - 543, month, day);
}

// ------------------------------------------------------------------
// การนำเข้าจาก Excel
// ------------------------------------------------------------------

export const PERSON_IMPORT_HEADERS = [
  "ประเภท",
  "คำนำหน้าหรือสมณศักดิ์",
  "ชื่อ",
  "ฉายา",
  "นามสกุล",
  "วันเกิด",
  "เลขประจำตัวประชาชน",
  "วันอุปสมบท",
  "น.ธ.",
  "ป.ธ.",
  "วุฒิสามัญ",
  "วัดที่สังกัด",
  "รหัสเขตปกครอง",
  "เบอร์ติดต่อ",
  "สถานะ",
] as const;
export const PERSON_IMPORT_MAX_ROWS = 2000;

/** แถวดิบจากไฟล์ (ข้อความทุกช่อง เรียงตามหัวคอลัมน์) */
export type PersonImportRaw = { rowNumber: number; cells: string[] };

/** แถวที่ตรวจแล้ว data = ข้อมูลที่จะส่งให้ฐานข้อมูล */
export type PersonImportRow = {
  rowNumber: number;
  cells: string[];
  status: "new" | "skip" | "error";
  message: string;
  data: Record<string, string | number> | null;
};

const TYPE_BY_TEXT = new Map<string, PersonType>([
  ["บรรพชิต", "monastic"],
  ["monastic", "monastic"],
  ["คฤหัสถ์", "lay"],
  ["lay", "lay"],
]);
const STATUS_BY_TEXT = new Map<string, PersonStatus>(
  PERSON_STATUSES.flatMap((s) => [
    [PERSON_STATUS_LABEL[s], s],
    [s, s],
  ]),
);
const NAK_THAM_BY_TEXT = new Map<string, string>([
  ["ตรี", "tri"],
  ["น.ธ.ตรี", "tri"],
  ["โท", "tho"],
  ["น.ธ.โท", "tho"],
  ["เอก", "ek"],
  ["น.ธ.เอก", "ek"],
]);
const PALI_BY_TEXT = new Map<string, string>([
  ["1-2", "p12"],
  ["ประโยค 1-2", "p12"],
  ...(["3", "4", "5", "6", "7", "8", "9"].flatMap((n) => [
    [n, `p${n}`],
    [`ป.ธ.${n}`, `p${n}`],
  ]) as [string, string][]),
]);

/** ซ่อนเลขประจำตัวประชาชน เหลือ 4 ตัวท้าย */
export function maskNationalId(value: string): string {
  const v = cleanNationalId(value);
  if (!v) return "";
  return v.length > 4 ? `${"x".repeat(v.length - 4)}${v.slice(-4)}` : v;
}

/**
 * ตรวจแถวที่อ่านจาก Excel (ยังไม่รู้ว่าซ้ำกับทะเบียนหรือไม่ ขั้นนั้นถามฐานข้อมูลทีหลัง)
 * units = รหัสเขตปกครองที่ผู้ใช้บันทึกได้
 */
export function validatePersonImportRows(
  raw: PersonImportRaw[],
  units: Map<string, { id: string; level: string }>,
  today: string = todayIso(),
): PersonImportRow[] {
  const seenIds = new Map<string, number>();
  return raw.map((r) => {
    const c = PERSON_IMPORT_HEADERS.map((_, i) => (r.cells[i] ?? "").trim());
    const [typeText, title, firstName, monasticName, lastName, birthText, nidText, ordText, ntText, paliText, generalEdu, temple, unitCode, phone, statusText] = c;
    const errors: string[] = [];

    const personType = TYPE_BY_TEXT.get(typeText.toLowerCase()) ?? null;
    if (!personType) errors.push(typeText ? `ไม่รู้จักประเภท "${typeText}"` : "ไม่มีประเภท");
    if (!firstName) errors.push("ไม่มีชื่อ");

    const birth = parseImportDate(birthText);
    if (birth === "invalid") errors.push(`วันเกิด "${birthText}" อ่านไม่ได้ (ใช้ วว/ดด/ปปปป เป็น พ.ศ.)`);
    else if (birth && birth > today) errors.push("วันเกิดเป็นวันในอนาคต");

    const ordained = parseImportDate(ordText);
    if (ordained === "invalid") errors.push(`วันอุปสมบท "${ordText}" อ่านไม่ได้ (ใช้ วว/ดด/ปปปป เป็น พ.ศ.)`);
    else if (ordained && ordained > today) errors.push("วันอุปสมบทเป็นวันในอนาคต");
    else if (ordained && birth && birth !== "invalid" && ordained <= birth) errors.push("วันอุปสมบทต้องอยู่หลังวันเกิด");

    const nid = cleanNationalId(nidText);
    if (nid) {
      if (!validNationalId(nid)) errors.push("เลขประจำตัวประชาชนไม่ถูกต้อง");
      else {
        const first = seenIds.get(nid);
        if (first !== undefined) errors.push(`เลขประจำตัวประชาชนซ้ำกับแถวที่ ${first}`);
        else seenIds.set(nid, r.rowNumber);
      }
    }

    const nakTham = ntText ? (NAK_THAM_BY_TEXT.get(ntText) ?? null) : "";
    if (nakTham === null) errors.push(`ไม่รู้จัก น.ธ. "${ntText}" (ใช้ ตรี โท เอก)`);
    const pali = paliText ? (PALI_BY_TEXT.get(paliText) ?? null) : "";
    if (pali === null) errors.push(`ไม่รู้จัก ป.ธ. "${paliText}" (ใช้ 1-2 หรือ 3 ถึง 9)`);

    const unit = units.get(unitCode);
    if (!unitCode) errors.push("ไม่มีรหัสเขตปกครอง");
    else if (!unit) errors.push(`ไม่พบรหัสเขตปกครอง "${unitCode}" ในเขตที่ท่านบันทึกได้`);
    else if (unit.level === "central") errors.push("เขตปกครองต้องเป็นระดับภาค จังหวัด อำเภอ หรือตำบล");

    const status = statusText ? (STATUS_BY_TEXT.get(statusText.toLowerCase()) ?? null) : "active";
    if (status === null) errors.push(`ไม่รู้จักสถานะ "${statusText}"`);

    // ตารางตัวอย่างไม่แสดงเลขประจำตัวประชาชนเต็ม
    const cells = [...c];
    cells[6] = maskNationalId(nidText);

    if (errors.length > 0) {
      return { rowNumber: r.rowNumber, cells, status: "error", message: errors.join(" / "), data: null };
    }
    return {
      rowNumber: r.rowNumber,
      cells,
      status: "new",
      message: "",
      data: {
        row_number: r.rowNumber,
        person_type: personType!,
        title,
        first_name: firstName,
        monastic_name: personType === "lay" ? "" : monasticName,
        last_name: lastName,
        birth_date: (birth as string | null) ?? "",
        national_id: nid,
        ordination_date: personType === "lay" ? "" : ((ordained as string | null) ?? ""),
        nak_tham: nakTham as string,
        pali_grade: pali as string,
        general_education: generalEdu,
        temple_name: temple,
        org_unit_id: unit!.id,
        phone,
        status: status as string,
      },
    };
  });
}
