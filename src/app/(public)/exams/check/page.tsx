import type { Metadata } from "next";
import Link from "next/link";

import { CheckForm } from "./check-form";

export const metadata: Metadata = { title: "ตรวจรายชื่อผู้ขอเข้าสอบ" };

/** หน้าคงที่ (ไม่อ่านฐานข้อมูลตอนเปิด เพราะเมนูสาธารณะโหลดล่วงหน้า) การค้นทำผ่าน Server Action */
export default function ExamCheckPage() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
      <p className="text-sm">
        <Link href="/exams" className="text-primary underline underline-offset-4">
          สอบธรรมสนามหลวง
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ตรวจรายชื่อผู้ขอเข้าสอบ</h1>
      <p className="mt-2 text-muted-foreground">
        ตรวจว่าสำนักเรียนหรือสถานศึกษาส่งรายชื่อของท่านเข้าสอบนักธรรมหรือธรรมศึกษาแล้ว ชั้นใด สนามสอบใด
        แสดงเฉพาะบัญชีที่สำนักส่งแล้ว (รวมที่อยู่ระหว่างรับรอง) ไม่แสดงเลขประจำตัวและวันเกิด
        ถ้าไม่ได้กรอกนามสกุลหรือฉายา จะแสดงเฉพาะอักษรตัวแรก
      </p>
      <CheckForm />
      <p className="mt-6 text-sm text-muted-foreground">ค้นได้ไม่เกิน 10 ครั้งต่อนาที แสดงผลไม่เกิน 20 รายการต่อครั้ง</p>
    </section>
  );
}
