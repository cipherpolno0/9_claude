/** แปลงข้อผิดพลาดจากฐานข้อมูลและระบบล็อกอินเป็นข้อความภาษาไทยที่อ่านเข้าใจ */
export function explainError(error: unknown): string {
  const e = (error ?? {}) as { code?: string; message?: string; status?: number };
  const msg = e.message ?? "";
  if (e.code === "23505") return "ข้อมูลนี้มีอยู่ในระบบแล้ว (รหัสหรืออีเมลซ้ำ)";
  // ข้อความที่ฟังก์ชันในฐานข้อมูลเขียนไว้เป็นภาษาไทยแล้ว
  if (["23514", "23503", "P0001"].includes(e.code ?? "") && msg) return msg;
  if (e.code === "42501") {
    return /[฀-๿]/.test(msg) ? msg : "ท่านไม่มีสิทธิ์ทำรายการนี้";
  }
  if (msg.includes("fetch failed")) return "เชื่อมต่อฐานข้อมูลไม่ได้ กรุณาตรวจค่าในไฟล์ .env.local";
  if (e.code === "invalid_credentials" || msg.includes("Invalid login credentials")) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  }
  if (e.code === "same_password") return "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม";
  if (e.code === "weak_password") return "รหัสผ่านคาดเดาง่ายเกินไป กรุณาตั้งใหม่";
  if (e.code === "email_exists" || e.code === "user_already_exists" || msg.includes("already been registered")) {
    return "อีเมลนี้มีบัญชีหรือคำขอบัญชีอยู่แล้ว";
  }
  if (e.code === "mfa_verification_failed" || msg.includes("Invalid TOTP")) {
    return "รหัส 6 หลักไม่ถูกต้องหรือหมดเวลา กรุณาลองรหัสใหม่";
  }
  if (e.code === "over_email_send_rate_limit" || e.status === 429) {
    return "ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่";
  }
  if (e.code === "email_address_invalid" || e.code === "validation_failed") return "รูปแบบอีเมลไม่ถูกต้อง";
  return msg ? `เกิดข้อผิดพลาด: ${msg}` : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
