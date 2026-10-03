import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // รองรับการอัปโหลดไฟล์ Excel ผ่านฟอร์ม
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
