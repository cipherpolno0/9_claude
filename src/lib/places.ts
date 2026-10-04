/** ชนิดข้อมูล ป้ายชื่อ และกติกานำเข้าของทะเบียนสถานที่ ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */

import type { Sect } from "@/lib/org-units";
import { parseImportDate } from "@/lib/persons";

export const PLACE_TYPES = ["temple", "samnak_rian", "samnak_sasanasuksa", "school", "organization"] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];

export const PLACE_TYPE_LABEL: Record<PlaceType, string> = {
  temple: "วัด",
  samnak_rian: "สำนักเรียน",
  samnak_sasanasuksa: "สำนักศาสนศึกษา",
  school: "สถานศึกษา",
  organization: "องค์กร",
};

export const isPlaceType = (value: unknown): value is PlaceType =>
  (PLACE_TYPES as readonly string[]).includes(String(value));

/** ประเภทที่ต้องผูกกับวัดที่ตั้ง */
export const needsParentTemple = (type: PlaceType) => type === "samnak_rian" || type === "samnak_sasanasuksa";
/** ประเภทที่ต้องระบุนิกาย */
export const needsSect = (type: PlaceType) => type === "temple" || needsParentTemple(type);

export const PLACE_STATUSES = ["open", "dissolved", "suspended"] as const;
export type PlaceStatus = (typeof PLACE_STATUSES)[number];
export const PLACE_STATUS_LABEL: Record<PlaceStatus, string> = {
  open: "เปิดดำเนินการ",
  dissolved: "ยุบ",
  suspended: "ระงับ",
};
export const PLACE_STATUS_CLASS: Record<string, string> = {
  open: "border-green-300 bg-green-100 text-green-900",
  suspended: "border-amber-400 bg-amber-100 text-amber-900",
  dissolved: "border-stone-300 bg-stone-200 text-stone-800",
};

export const PLACE_COLUMNS =
  "id, place_type, code, name, sect, house_no, road, subdistrict_code, district_code, province_code, postal_code, " +
  "org_unit_id, latitude, longitude, office_phone, email, responsible_person_id, status, established_on, " +
  "parent_place_id, note, is_active, created_at, updated_at";

export type Place = {
  id: string;
  place_type: PlaceType;
  code: string;
  name: string;
  sect: Sect | null;
  house_no: string;
  road: string;
  subdistrict_code: number | null;
  district_code: number | null;
  province_code: number | null;
  postal_code: string;
  org_unit_id: string;
  latitude: number | null;
  longitude: number | null;
  office_phone: string;
  email: string;
  responsible_person_id: string | null;
  status: PlaceStatus;
  established_on: string | null;
  parent_place_id: string | null;
  note: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PlaceAddressParts = {
  house_no: string;
  road: string;
  subdistrict_name: string | null;
  subdistrict_prefix: string | null;
  district_name: string | null;
  district_prefix: string | null;
  province_name: string | null;
  postal_code: string;
};

/** ที่ตั้งแบบข้อความ เช่น 287 ถนนพระสุเมรุ แขวงบวรนิเวศ เขตพระนคร กรุงเทพมหานคร 10200 */
export function placeAddress(p: PlaceAddressParts, withPostal = true): string {
  const bangkok = p.district_prefix === "เขต";
  return [
    p.house_no,
    p.road,
    p.subdistrict_name ? `${p.subdistrict_prefix ?? "ตำบล"}${p.subdistrict_name}` : "",
    p.district_name ? `${p.district_prefix ?? "อำเภอ"}${p.district_name}` : "",
    p.province_name ? (bangkok ? p.province_name : `จังหวัด${p.province_name}`) : "",
    withPostal ? p.postal_code : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export const PLACE_FIELD_LABEL: Record<string, string> = {
  place_type: "ประเภท",
  code: "รหัส",
  name: "ชื่อ",
  sect: "นิกาย",
  house_no: "เลขที่",
  road: "ถนน",
  subdistrict_code: "รหัสตำบล",
  district_code: "รหัสอำเภอ",
  province_code: "รหัสจังหวัด",
  postal_code: "รหัสไปรษณีย์",
  org_unit_id: "เขตปกครองคณะสงฆ์",
  latitude: "ละติจูด",
  longitude: "ลองจิจูด",
  office_phone: "โทรศัพท์สำนักงาน",
  email: "อีเมล",
  responsible_person_id: "ผู้รับผิดชอบ",
  status: "สถานะ",
  established_on: "วันที่จัดตั้ง",
  parent_place_id: "วัดที่ตั้ง",
  note: "หมายเหตุ",
  is_active: "ใช้งาน",
};

// ------------------------------------------------------------------
// นำเข้าจาก Excel (ทีละประเภท)
// ------------------------------------------------------------------

const BASE_HEADERS = [
  "รหัส",
  "ชื่อ",
  "นิกาย",
  "เลขที่",
  "ถนน",
  "ตำบล",
  "อำเภอ",
  "จังหวัด",
  "รหัสไปรษณีย์",
  "รหัสเขตปกครองคณะสงฆ์",
  "ละติจูด",
  "ลองจิจูด",
  "โทรศัพท์สำนักงาน",
  "อีเมล",
  "สถานะ",
  "วันที่จัดตั้ง",
] as const;

/** หัวคอลัมน์ของแม่แบบ: สำนักเรียนและสำนักศาสนศึกษามีคอลัมน์ รหัสวัดที่ตั้ง เพิ่มท้าย */
export function placeImportHeaders(type: PlaceType): string[] {
  return needsParentTemple(type) ? [...BASE_HEADERS, "รหัสวัดที่ตั้ง"] : [...BASE_HEADERS];
}

export const PLACE_IMPORT_MAX_ROWS = 3000;

export type PlaceImportRaw = { rowNumber: number; cells: string[] };

/** ข้อมูลหนึ่งแถวที่ผ่านการตรวจรูปแบบแล้ว (ส่งให้ฟังก์ชันฐานข้อมูลตรวจต่อ) */
export type PlaceImportData = {
  row_number: number;
  code: string;
  name: string;
  sect: string;
  house_no: string;
  road: string;
  subdistrict: string;
  district: string;
  province: string;
  postal_code: string;
  org_unit_code: string;
  latitude: number | null;
  longitude: number | null;
  office_phone: string;
  email: string;
  status: PlaceStatus;
  established_on: string | null;
  parent_code: string;
};

export type PlaceImportRow = PlaceImportRaw & {
  status: "new" | "skip" | "error";
  message: string;
  data: PlaceImportData | null;
};

const SECT_BY_LABEL: Record<string, string> = { "": "", มหานิกาย: "mahanikaya", ธรรมยุต: "dhammayut", ธรรมยุติกนิกาย: "dhammayut" };
const STATUS_BY_LABEL: Record<string, PlaceStatus> = { "": "open", เปิดดำเนินการ: "open", ยุบ: "dissolved", ระงับ: "suspended" };

function parseCoordinate(text: string, limit: number): number | null | "invalid" {
  if (!text) return null;
  if (!/^-?\d{1,3}(\.\d+)?$/.test(text)) return "invalid";
  const n = Number(text);
  return Math.abs(n) <= limit ? Math.round(n * 1e6) / 1e6 : "invalid";
}

/** ตรวจรูปแบบของทุกแถว (ชื่อจังหวัด อำเภอ ตำบล รหัสเขต สิทธิ์ และชื่อซ้ำ ตรวจต่อในฐานข้อมูล) */
export function validatePlaceImportRows(type: PlaceType, raw: PlaceImportRaw[]): PlaceImportRow[] {
  return raw.map(({ rowNumber, cells }) => {
    const c = cells.map((v) => String(v ?? "").trim());
    const errors: string[] = [];
    const sect = SECT_BY_LABEL[c[2]];
    const status = STATUS_BY_LABEL[c[14]];
    const latitude = parseCoordinate(c[10], 90);
    const longitude = parseCoordinate(c[11], 180);
    const established = parseImportDate(c[15]);

    if (!c[0]) errors.push("ไม่ได้กรอกรหัส");
    if (!c[1]) errors.push("ไม่ได้กรอกชื่อ");
    if (sect === undefined) errors.push("นิกายต้องเป็น มหานิกาย หรือ ธรรมยุต");
    else if (type === "temple" && !sect) errors.push("วัดต้องระบุนิกาย");
    if (!c[6] || !c[7]) errors.push("ต้องกรอกอำเภอและจังหวัด");
    if (c[8] && !/^\d{5}$/.test(c[8])) errors.push("รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก");
    if (!c[9]) errors.push("ไม่ได้กรอกรหัสเขตปกครองคณะสงฆ์");
    if (latitude === "invalid") errors.push("ละติจูดต้องเป็นตัวเลขระหว่าง -90 ถึง 90");
    if (longitude === "invalid") errors.push("ลองจิจูดต้องเป็นตัวเลขระหว่าง -180 ถึง 180");
    if ((latitude === null) !== (longitude === null)) errors.push("พิกัดต้องกรอกทั้งละติจูดและลองจิจูด");
    if (c[13] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c[13])) errors.push("รูปแบบอีเมลไม่ถูกต้อง");
    if (status === undefined) errors.push("สถานะต้องเป็น เปิดดำเนินการ ยุบ หรือ ระงับ");
    if (established === "invalid") errors.push("วันที่จัดตั้งต้องเป็น วว/ดด/ปปปป (พ.ศ.)");
    if (needsParentTemple(type) && !c[16]) errors.push("ต้องกรอกรหัสวัดที่ตั้ง");

    if (errors.length > 0) return { rowNumber, cells, status: "error", message: errors.join(" / "), data: null };
    return {
      rowNumber,
      cells,
      status: "new",
      message: "",
      data: {
        row_number: rowNumber,
        code: c[0],
        name: c[1],
        sect: sect ?? "",
        house_no: c[3],
        road: c[4],
        subdistrict: c[5],
        district: c[6],
        province: c[7],
        postal_code: c[8],
        org_unit_code: c[9],
        latitude: latitude as number | null,
        longitude: longitude as number | null,
        office_phone: c[12],
        email: c[13],
        status: status as PlaceStatus,
        established_on: established as string | null,
        parent_code: needsParentTemple(type) ? c[16] : "",
      },
    };
  });
}

// ------------------------------------------------------------------
// เขตการปกครองบ้านเมือง
// ------------------------------------------------------------------

export type CivilOption = { code: number; name: string; prefix?: string; postal_code?: string };

export const CIVIL_IMPORT_HEADERS = [
  "รหัสจังหวัด",
  "จังหวัด",
  "รหัสอำเภอ",
  "อำเภอ",
  "รหัสตำบล",
  "ตำบล",
  "รหัสไปรษณีย์",
] as const;
export const CIVIL_IMPORT_MAX_ROWS = 8000;

export type CivilImportData = {
  province_code: number;
  province_name: string;
  district_code: number;
  district_name: string;
  district_prefix: string;
  subdistrict_code: number;
  subdistrict_name: string;
  subdistrict_prefix: string;
  postal_code: string;
};
