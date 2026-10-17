import type { Metadata } from "next";

import { UnderDevelopment } from "@/components/public/under-development";

export const metadata: Metadata = { title: "คลังข้อสอบ แผนกบาลี" };

/** หน้าคงที่ (บทที่ 33 สร้างไว้ก่อน ยังไม่อ่านฐานข้อมูล) */
export default function QuizPaliPage() {
  return (
    <UnderDevelopment
      title="คลังข้อสอบ แผนกบาลี"
      description="แบบทดสอบก่อนเรียน บทเรียน และแบบทดสอบหลังเรียน ประโยค 1-2 ถึง ป.ธ.9 และบาลีศึกษา"
      back={{ href: "/quiz", label: "กลับไปคลังข้อสอบ แผนกธรรม" }}
    />
  );
}
