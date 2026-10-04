import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { fetchEducationPositionTypes } from "@/lib/education-server";

import { PositionTypeManager } from "./position-type-manager";

export const metadata: Metadata = { title: "ประเภทตำแหน่ง จศป." };
export const dynamic = "force-dynamic";

export default async function EducationPositionsPage() {
  await requireAdmin();
  const types = await fetchEducationPositionTypes();

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ประเภทตำแหน่ง จศป.</h1>
      <p className="mt-1 text-muted-foreground">
        ประเภทตำแหน่งของแต่ละแท่ง ใช้เป็นตัวเลือกเมื่อบันทึก จศป. รายการที่เลิกใช้ให้ปิดใช้งาน (ไม่ลบ) ข้อมูลเดิมที่อ้างถึงยังคงอยู่
      </p>
      <PositionTypeManager types={types} />
    </section>
  );
}
