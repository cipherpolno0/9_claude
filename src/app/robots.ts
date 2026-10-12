import type { MetadataRoute } from "next";

import { appEnvironment } from "@/lib/environment";

/** ชุดใช้งานจริง: ให้ค้นหน้าสาธารณะได้ ยกเว้นพื้นที่ทำงานและ API / ชุดอื่น: ห้ามเก็บทุกหน้า */
export default function robots(): MetadataRoute.Robots {
  if (appEnvironment() !== "production") return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/app/", "/api/", "/account/", "/auth/"] } };
}
