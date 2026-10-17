import type { Metadata } from "next";

import { UnderDevelopment } from "@/components/public/under-development";

export const metadata: Metadata = { title: "ขั้นตอนการสมัครสอบ (บาลี)" };

/** หน้าคงที่ (บทที่ 33 สร้างไว้ก่อน ยังไม่อ่านฐานข้อมูล) */
export default function PaliApplyPage() {
  return (
    <UnderDevelopment
      title="ขั้นตอนการสมัครสอบ (บาลี)"
      description="ขั้นตอนการส่งรายชื่อผู้ขอเข้าสอบประโยคบาลีและบาลีศึกษา แบบบัญชี ศ. และคุณสมบัติผู้สมัคร"
      back={{ href: "/pali", label: "กลับไปหน้าสอบบาลีสนามหลวง" }}
    />
  );
}
