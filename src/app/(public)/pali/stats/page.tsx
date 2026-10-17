import type { Metadata } from "next";

import { UnderDevelopment } from "@/components/public/under-development";

export const metadata: Metadata = { title: "สถิติ (บาลี)" };

/** หน้าคงที่ (บทที่ 33 สร้างไว้ก่อน ยังไม่อ่านฐานข้อมูล) */
export default function PaliStatsPage() {
  return (
    <UnderDevelopment
      title="สถิติ (บาลี)"
      description="สถิติผู้สมัครสอบและผลสอบประโยคบาลีและบาลีศึกษา แยกปี ครั้งที่ ชั้น ภาค และจังหวัด"
      back={{ href: "/pali", label: "กลับไปหน้าสอบบาลีสนามหลวง" }}
    />
  );
}
