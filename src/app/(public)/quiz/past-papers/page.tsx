import type { Metadata } from "next";

import { UnderDevelopment } from "@/components/public/under-development";

export const metadata: Metadata = { title: "ข้อสอบเก่าพร้อมเฉลย" };

/** หน้าคงที่ (บทที่ 33 สร้างไว้ก่อน ยังไม่อ่านฐานข้อมูล) */
export default function QuizPastPapersPage() {
  return (
    <UnderDevelopment
      title="ข้อสอบเก่าพร้อมเฉลย"
      description="ข้อสอบสนามหลวงย้อนหลังพร้อมเฉลย แผนกธรรมและแผนกบาลี เปิดดูและดาวน์โหลดได้"
      back={{ href: "/quiz", label: "กลับไปคลังข้อสอบ" }}
    />
  );
}
