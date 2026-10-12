/**
 * สภาพแวดล้อมของเว็บ (บทที่ 32): production = ใช้งานจริง / staging = ชุดทดสอบ / development = เครื่องผู้พัฒนา
 * ตั้งด้วยตัวแปร NEXT_PUBLIC_APP_ENV ในแต่ละชุดบน Vercel (ไม่ตั้ง = development)
 * ชุดทดสอบแสดงแถบเตือนทุกหน้าและไม่ให้เครื่องมือค้นหาเก็บหน้าเว็บ
 */
export type AppEnvironment = "production" | "staging" | "development";

export function appEnvironment(): AppEnvironment {
  const v = process.env.NEXT_PUBLIC_APP_ENV;
  return v === "production" || v === "staging" ? v : "development";
}

export const ENVIRONMENT_LABEL: Record<AppEnvironment, string> = {
  production: "ใช้งานจริง",
  staging: "ชุดทดสอบ",
  development: "เครื่องผู้พัฒนา",
};
