import type { Metadata } from "next";

import { UnderDevelopment } from "@/components/public/under-development";

export const metadata: Metadata = { title: "สนามสอบบาลี" };

/** หน้าคงที่ (บทที่ 33 สร้างไว้ก่อน ยังไม่อ่านฐานข้อมูล) */
export default function PaliVenuesPage() {
  return (
    <UnderDevelopment
      title="สนามสอบบาลี"
      description="รายชื่อสนามสอบบาลีทั่วประเทศ ส่วนกลาง ส่วนภูมิภาค และต่างประเทศ พร้อมชั้นที่เปิดสอบ"
      back={{ href: "/pali", label: "กลับไปหน้าสอบบาลีสนามหลวง" }}
    />
  );
}
