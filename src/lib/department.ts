/**
 * แผนก (บทที่ 33): ทุกระบบมีงาน 2 แผนก
 * dhamma = แผนกธรรม (นักธรรม ธรรมศึกษา ข้อมูลเดิมทั้งหมด) / pali = แผนกบาลี
 * แผนกที่เลือกเก็บในคุกกี้ DEPT_COOKIE (ค่าเริ่มต้น dhamma) ที่อยู่หน้าเว็บที่มี ?dept= ชนะคุกกี้
 * ไฟล์นี้ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์ (ห้าม import ของฝั่งเซิร์ฟเวอร์)
 */
export const DEPARTMENTS = ["dhamma", "pali"] as const;
export type Department = (typeof DEPARTMENTS)[number];
export const DEFAULT_DEPARTMENT: Department = "dhamma";
export const DEPT_COOKIE = "dept";
export const DEPT_PARAM = "dept";

export const DEPARTMENT_LABEL: Record<Department, string> = { dhamma: "นักธรรม-ธรรมศึกษา", pali: "บาลี" };

export const isDepartment = (value: unknown): value is Department =>
  (DEPARTMENTS as readonly string[]).includes(String(value));

/** แผนกที่ใช้: ?dept= ชนะคุกกี้ ค่าที่ไม่ถูกต้องใช้ค่าเริ่มต้น */
export function resolveDepartment(param: unknown, cookie: unknown): Department {
  if (isDepartment(param)) return param;
  if (isDepartment(cookie)) return cookie;
  return DEFAULT_DEPARTMENT;
}

/**
 * หน้าที่มีทั้งสองแผนก (สวิตช์แผนกแสดงเฉพาะหน้าเหล่านี้ หน้าอื่นซ่อนปุ่ม)
 * - DEPT_PAGE_PAIRS: หน้าที่แยกตามแผนกเป็นคนละที่อยู่ แผนกของหน้าถูกกำหนดด้วยที่อยู่ เปิดหน้าแล้วคุกกี้เปลี่ยนตาม
 *   กดสลับแล้วไปหน้าคู่กัน จับคู่ตามคำนำหน้าที่อยู่ยาวที่สุดก่อน หน้าที่ลึกกว่าคู่ สลับแล้วไปหน้าแรกของอีกแผนก
 *   followCookie = เมนูหลักที่ชี้หน้านี้ให้ไปหน้าของแผนกที่เลือกไว้ (ใช้กับเมนูที่รวมสองแผนกไว้ในเมนูเดียว เช่น คลังข้อสอบ)
 * - DEPT_SHARED_PATHS: หน้าเดียวที่แสดงข้อมูลตามแผนกที่เลือก (?dept= หรือคุกกี้) บทต่อ ๆ ไปเพิ่มเมื่อหน้านั้นรองรับแผนกบาลีแล้ว
 * - DEPT_NO_SWITCH: หน้าใต้คู่ที่ไม่ควรมีปุ่ม (กำลังทำข้อสอบ ผลการเรียนของฉัน)
 */
export const DEPT_PAGE_PAIRS: { dhamma: string; pali: string; followCookie?: boolean }[] = [
  { dhamma: "/exams/check", pali: "/pali/check" },
  { dhamma: "/exams/results", pali: "/pali/results" },
  { dhamma: "/exams/stats", pali: "/pali/stats" },
  { dhamma: "/exams", pali: "/pali" },
  { dhamma: "/quiz", pali: "/quiz/pali", followCookie: true },
];
export const DEPT_SHARED_PATHS: string[] = ["/quiz/past-papers"];
export const DEPT_NO_SWITCH: string[] = ["/quiz/attempt", "/quiz/my"];

const matches = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

export type DeptPage =
  | { kind: "pair"; side: Department; hrefs: Record<Department, string> }
  | { kind: "shared" };

/** ชนิดของหน้าในเรื่องแผนก คืน null ถ้าหน้านี้มีแผนกเดียว (ซ่อนสวิตช์) */
export function deptPage(pathname: string): DeptPage | null {
  if (DEPT_NO_SWITCH.some((p) => matches(pathname, p))) return null;
  if (DEPT_SHARED_PATHS.some((p) => matches(pathname, p))) return { kind: "shared" };
  let best: { pair: (typeof DEPT_PAGE_PAIRS)[number]; side: Department; len: number } | null = null;
  for (const pair of DEPT_PAGE_PAIRS) {
    for (const side of DEPARTMENTS) {
      const base = pair[side];
      if (matches(pathname, base) && (!best || base.length > best.len)) best = { pair, side, len: base.length };
    }
  }
  if (!best) return null;
  return { kind: "pair", side: best.side, hrefs: { dhamma: best.pair.dhamma, pali: best.pair.pali } };
}

/** ที่อยู่ของเมนูหลักตามแผนกที่เลือกไว้ (เฉพาะคู่ที่ followCookie) */
export function deptMenuHref(href: string, dept: Department): string {
  const pair = DEPT_PAGE_PAIRS.find((p) => p.followCookie && p.dhamma === href);
  return pair ? pair[dept] : href;
}
