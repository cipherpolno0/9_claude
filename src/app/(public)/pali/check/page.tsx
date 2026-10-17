import type { Metadata } from "next";

import { UnderDevelopment } from "@/components/public/under-development";

export const metadata: Metadata = { title: "ตรวจรายชื่อผู้ขอเข้าสอบ (บาลี)" };

/** หน้าคงที่ (บทที่ 33 สร้างไว้ก่อน ยังไม่อ่านฐานข้อมูล) */
export default function PaliCheckPage() {
  return (
    <UnderDevelopment
      title="ตรวจรายชื่อผู้ขอเข้าสอบ (บาลี)"
      description="ค้นรายชื่อผู้ขอเข้าสอบประโยคบาลีและบาลีศึกษาที่สำนักเรียนส่งตามบัญชี ศ. ฝ่ายบาลี"
      back={{ href: "/pali", label: "กลับไปหน้าสอบบาลีสนามหลวง" }}
    />
  );
}
