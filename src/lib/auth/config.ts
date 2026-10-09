/** ค่าตั้งด้านบัญชีผู้ใช้ที่ใช้ร่วมกันทั้งเซิร์ฟเวอร์และหน้าจอ */

export const PASSWORD_MIN_LENGTH = 10;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "รหัสผ่านต้องมีทั้งตัวอักษรภาษาอังกฤษและตัวเลข";
  }
  return null;
}

export const LETTER_MAX_BYTES = 10 * 1024 * 1024;
export const LETTER_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
export const LETTER_BUCKET = "account-letters";

/** บทบาทที่เลือกได้ในแบบฟอร์มขอบัญชี (บทบาทผู้ดูแลระบบให้ผู้ดูแลระบบเพิ่มเองภายหลัง) */
export const REQUESTABLE_ROLES = [
  "chief",
  "deputy_chief",
  "secretary",
  "education_staff",
  "school_officer",
  "finance_officer",
  "supplies_officer",
  "saraban_officer",
  "central_staff",
  "quiz_manager",
] as const;

export const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  active: "ใช้งาน",
  suspended: "ถูกระงับ",
  rejected: "ไม่อนุมัติ",
};

/**
 * เมนูพื้นที่ทำงานที่แต่ละบทบาทใช้ได้ และขอบเขตการดู/แก้ไขทะเบียนบุคคล
 * เก็บในฐานข้อมูล (ตาราง role_menus และ roles.personnel_view / personnel_edit)
 * ผู้ดูแลระบบแก้ได้ที่หน้า ผู้ดูแลระบบ > สิทธิ์ตามบทบาท
 * ทุกบทบาทเห็นแดชบอร์ด (/app) เสมอ และผู้ดูแลระบบเห็นทุกเมนูเสมอ
 */
export const PERSONNEL_SCOPES = ["none", "own", "subtree", "all"] as const;
export type PersonnelScope = (typeof PERSONNEL_SCOPES)[number];

export const PERSONNEL_SCOPE_LABEL: Record<PersonnelScope, string> = {
  none: "ไม่ได้",
  own: "เฉพาะหน่วยตน",
  subtree: "หน่วยตนและหน่วยใต้สังกัด",
  all: "ทุกเขต",
};

export const scopeRank = (scope: PersonnelScope) => PERSONNEL_SCOPES.indexOf(scope);

/** บทบาทที่เข้าหน้า "บัญชีผู้ใช้" และ "ทบทวนสิทธิ์" ได้ (ผู้อนุมัติ) */
export const ACCOUNT_MANAGER_ROLES = ["admin", "central_staff", "chief", "deputy_chief", "secretary"];

/** บทบาทที่จัดการคลังข้อสอบได้ (ต้องตรงกับฟังก์ชัน can_manage_quiz ในฐานข้อมูล ซึ่งเป็นตัวตัดสินสิทธิ์จริง) */
export const QUIZ_MANAGER_ROLES: readonly string[] = ["quiz_manager", "admin"];

/** บทบาทที่จัดการรอบสมัครสอบได้ (ส่วนกลางและผู้ดูแลระบบ) ต้องตรงกับ can_manage_exam_rounds() ในฐานข้อมูล */
export const EXAM_ROUND_MANAGER_ROLES: readonly string[] = ["admin", "central_staff"];
