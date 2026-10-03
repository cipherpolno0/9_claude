import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // รองรับการอัปโหลดไฟล์ Excel และหนังสือรับรอง (ไม่เกิน 10 MB) ผ่านฟอร์ม
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
