/** ชนิดข้อมูลและป้ายชื่อของทะเบียน จศป. ใช้ร่วมกันทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ */

export const TRACKS = ["dhamma", "pali", "general", "supervisor"] as const;
export type Track = (typeof TRACKS)[number];
export const TRACK_LABEL: Record<Track, string> = {
  dhamma: "แผนกธรรม",
  pali: "แผนกบาลี",
  general: "แผนกสามัญ",
  supervisor: "ปริยัตินิเทศก์",
};

export const SCHOOL_TYPES = ["samnak_rian", "samnak_sasanasuksa", "school"] as const;
export type SchoolType = (typeof SCHOOL_TYPES)[number];
export const SCHOOL_TYPE_LABEL: Record<string, string> = {
  samnak_rian: "สำนักเรียน",
  samnak_sasanasuksa: "สำนักศาสนศึกษา",
  school: "โรงเรียน",
};

export const STAFF_STATUSES = ["active", "suspended", "ended"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];
export const STAFF_STATUS_LABEL: Record<StaffStatus, string> = {
  active: "ปฏิบัติหน้าที่",
  suspended: "พักหน้าที่",
  ended: "พ้นหน้าที่",
};

export type EducationPositionType = {
  id: string;
  track: Track;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type EducationStaff = {
  id: string;
  person_id: string;
  track: Track;
  position_type_id: string;
  position_name: string;
  school_name: string;
  school_type: string;
  org_unit_id: string;
  org_unit_name: string;
  started_on: string | null;
  order_no: string;
  subjects: string;
  status: StaffStatus;
  ended_on: string | null;
  note: string;
  is_active: boolean;
};

export const isTrack = (value: unknown): value is Track => (TRACKS as readonly string[]).includes(String(value));
