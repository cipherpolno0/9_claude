import type { Metadata } from "next";

import { UnderDevelopment } from "@/components/public/under-development";

export const metadata: Metadata = { title: "ค้นผลสอบ (บาลี)" };

/** หน้าคงที่ (บทที่ 33 สร้างไว้ก่อน ยังไม่อ่านฐานข้อมูล) */
export default function PaliResultsPage() {
  return (
    <UnderDevelopment
      title="ค้นผลสอบ (บาลี)"
      description="ค้นรายชื่อผู้สอบประโยคบาลีและบาลีศึกษาได้ ด้วยชื่อ วัด สำนักเรียน หรือดูรวมรายปี"
      back={{ href: "/pali", label: "กลับไปหน้าสอบบาลีสนามหลวง" }}
    />
  );
}
