/** ชนิดข้อมูลและป้ายชื่อของทะเบียนสนามสอบ ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */

export const VENUE_TYPES = ["nak_tham", "tham_sueksa"] as const;
export type VenueType = (typeof VENUE_TYPES)[number];
export const VENUE_TYPE_LABEL: Record<VenueType, string> = { nak_tham: "นักธรรม", tham_sueksa: "ธรรมศึกษา" };
export const isVenueType = (value: unknown): value is VenueType =>
  (VENUE_TYPES as readonly string[]).includes(String(value));

export const VENUE_LEVELS = ["tri", "tho", "ek"] as const;
export type VenueLevel = (typeof VENUE_LEVELS)[number];
export const VENUE_LEVEL_LABEL: Record<VenueLevel, string> = { tri: "ชั้นตรี", tho: "ชั้นโท", ek: "ชั้นเอก" };

/** ชั้นที่เปิดสอบแบบข้อความ เช่น ชั้นตรี ชั้นโท ชั้นเอก */
export function venueLevelsText(levels: string[] | null | undefined): string {
  return VENUE_LEVELS.filter((l) => (levels ?? []).includes(l))
    .map((l) => VENUE_LEVEL_LABEL[l])
    .join(" ");
}

export const VENUE_STATUSES = ["open", "closed", "moved"] as const;
export type VenueStatus = (typeof VENUE_STATUSES)[number];
export const VENUE_STATUS_LABEL: Record<VenueStatus, string> = { open: "เปิด", closed: "ปิด", moved: "ย้าย" };
export const VENUE_STATUS_CLASS: Record<string, string> = {
  open: "border-green-300 bg-green-100 text-green-900",
  moved: "border-sky-300 bg-sky-100 text-sky-900",
  closed: "border-stone-300 bg-stone-200 text-stone-800",
};

export const OFFICER_ROLES = ["chair", "receiver"] as const;
export type OfficerRole = (typeof OFFICER_ROLES)[number];
export const OFFICER_ROLE_LABEL: Record<OfficerRole, string> = { chair: "ประธานสนามสอบ", receiver: "ผู้รับข้อสอบ" };
export const isOfficerRole = (value: unknown): value is OfficerRole =>
  (OFFICER_ROLES as readonly string[]).includes(String(value));

export type AcademicYear = {
  id: string;
  year_be: number;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
  /** วันสุดท้ายที่รับคำขอเปิด ปิด ย้ายสนามสอบของปีนี้ (ว่าง = ไม่กำหนด) */
  request_deadline: string | null;
};

/** วันนี้ตามเวลาประเทศไทย รูปแบบ YYYY-MM-DD */
export const todayInBangkok = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

/** พ้นวันปิดรับคำขอสนามสอบของปีการศึกษานี้แล้วหรือไม่ (ตรงกับ private.check_request_deadline ในฐานข้อมูล) */
export const requestDeadlinePassed = (year: Pick<AcademicYear, "request_deadline">, today = todayInBangkok()) =>
  Boolean(year.request_deadline) && today > (year.request_deadline as string);

export const VENUE_FIELD_LABEL: Record<string, string> = {
  code: "รหัสสนามสอบ",
  name: "ชื่อ",
  venue_type: "ประเภท",
  place_id: "สถานที่ตั้ง",
  org_unit_id: "เขตปกครองคณะสงฆ์",
  levels: "ชั้นที่เปิดสอบ",
  capacity: "ความจุ",
  status: "สถานะ",
  moved_to_venue_id: "สนามสอบที่ย้ายไป",
  request_deadline: "วันปิดรับคำขอ",
  start_year_be: "ปีการศึกษาที่เริ่มใช้",
  note: "หมายเหตุ",
  is_active: "ใช้งาน",
  // venue_officers
  venue_id: "สนามสอบ",
  academic_year_id: "ปีการศึกษา",
  role: "บทบาท",
  person_id: "บุคคล",
  delivery_address: "ที่อยู่สำหรับจัดส่งข้อสอบ",
  contact_phone: "เบอร์ติดต่อ",
  is_public: "เผยแพร่ชื่อต่อสาธารณะ",
  is_phone_public: "เผยแพร่เบอร์ติดต่อต่อสาธารณะ",
  copied_from_id: "คัดลอกจากปีก่อน",
};
