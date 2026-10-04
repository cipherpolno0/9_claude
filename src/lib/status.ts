/** ชนิดคำขอและการแจ้งเรื่องสถานะบุคคล และป้ายชื่อ ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */

/** คำขอ (ต้องได้รับอนุมัติ) */
export const STATUS_REQUEST_TYPES = ["transfer", "resign"] as const;
/** การแจ้ง (เลขานุการบันทึก หน่วยเหนือ 1 ชั้นรับทราบ) */
export const STATUS_NOTICE_TYPES = ["death_notice", "disrobe_notice", "other_exit_notice"] as const;
export const STATUS_TYPES = [...STATUS_REQUEST_TYPES, ...STATUS_NOTICE_TYPES] as const;
export type StatusType = (typeof STATUS_TYPES)[number];

export const isStatusType = (value: unknown): value is StatusType =>
  (STATUS_TYPES as readonly string[]).includes(String(value));
export const isNoticeType = (value: unknown): boolean =>
  (STATUS_NOTICE_TYPES as readonly string[]).includes(String(value));

/** ชื่อชนิด (มรณภาพ-ตาย เลือกคำตามประเภทบุคคล) */
export function statusTypeLabel(type: string, personType?: string): string {
  switch (type) {
    case "transfer":
      return "ขอย้าย";
    case "resign":
      return "ขอลาออก";
    case "death_notice":
      return personType === "monastic" ? "แจ้งมรณภาพ" : personType === "lay" ? "แจ้งการตาย" : "แจ้งมรณภาพ-ตาย";
    case "disrobe_notice":
      return "แจ้งลาสิกขา";
    case "other_exit_notice":
      return "แจ้งพ้นตำแหน่งด้วยเหตุอื่น";
    case "profile_edit":
      return "ขอแก้ไขประวัติ";
    default:
      return type;
  }
}

/** ชนิดคำขอของทะเบียนบุคคลทั้งหมด (ใช้เป็นตัวกรองในหน้ารายการ) */
export const PERSONNEL_REQUEST_TYPES = [...STATUS_TYPES, "profile_edit"] as const;

/** ป้ายของรายการในเส้นเวลาสถานะ (ตาราง status_changes) */
export function statusChangeLabel(changeType: string, personType: string): string {
  switch (changeType) {
    case "transfer":
      return "ย้าย";
    case "resign":
      return "ลาออก";
    case "death":
      return personType === "lay" ? "ตาย" : "มรณภาพ";
    case "disrobe":
      return "ลาสิกขา";
    case "other":
      return "พ้นตำแหน่งด้วยเหตุอื่น";
    default:
      return changeType;
  }
}

export type StatusChange = {
  id: string;
  person_id: string;
  change_type: string;
  effective_on: string;
  reason: string;
  request_id: string | null;
  request_no: string | null;
  from_unit_name: string | null;
  to_unit_name: string | null;
  from_place: string;
  to_place: string;
  status_before: string;
  status_after: string;
  created_at: string;
};

export type OpenStatusRequest = { id: string; request_no: string; type_key: string; status: string };
