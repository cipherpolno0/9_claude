import type { NextConfig } from "next";

/**
 * หัวความปลอดภัยของทุกหน้า (บทที่ 32)
 * HSTS บังคับใช้ HTTPS (Vercel เปลี่ยน http เป็น https ให้อยู่แล้ว) ห้ามเว็บอื่นฝังหน้าเว็บนี้ในกรอบ ห้ามเดาชนิดไฟล์
 * ไม่ได้ตั้ง script-src ใน CSP เพราะ Next.js ใช้สคริปต์ในหน้า (ต้องใช้ nonce ซึ่งทำให้ทุกหน้าเป็นหน้าแบบไดนามิก)
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // รองรับการอัปโหลดไฟล์ Excel และหนังสือรับรอง (ไม่เกิน 10 MB) ผ่านฟอร์ม
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
