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
 * เมนูพื้นที่ทำงานที่แต่ละบทบาทเห็น (แก้ที่นี่ที่เดียว)
 * "*" = เห็นทุกเมนู  ทุกบทบาทเห็นแดชบอร์ด (/app) เสมอ
 */
export const ROLE_MENUS: Record<string, string[] | "*"> = {
  admin: "*",
  central_staff: "*",
  chief: ["/app/personnel", "/app/places", "/app/requests", "/app/exams", "/app/docs", "/app/budget", "/app/assets"],
  deputy_chief: ["/app/personnel", "/app/places", "/app/requests", "/app/exams", "/app/docs", "/app/budget", "/app/assets"],
  secretary: ["/app/personnel", "/app/places", "/app/requests", "/app/exams", "/app/docs", "/app/budget", "/app/assets"],
  education_staff: ["/app/personnel", "/app/places", "/app/exams", "/app/docs"],
  school_officer: ["/app/places", "/app/requests", "/app/exams"],
  finance_officer: ["/app/budget", "/app/docs"],
  supplies_officer: ["/app/assets", "/app/docs"],
  saraban_officer: ["/app/docs"],
  quiz_manager: ["/app/quiz"],
  learner: ["/app/quiz"],
};

/** บทบาทที่เข้าหน้า "บัญชีผู้ใช้" และ "ทบทวนสิทธิ์" ได้ (ผู้อนุมัติ) */
export const ACCOUNT_MANAGER_ROLES = ["admin", "central_staff", "chief", "deputy_chief", "secretary"];
