import type { Metadata } from "next";
import Link from "next/link";

import { findPublicMenu } from "@/lib/site";

import { CoursePicker } from "./course-picker";

const menu = findPublicMenu("/quiz");

export const metadata: Metadata = { title: menu.title };

// หน้านี้เป็นหน้าคงที่ (ไม่อ่านฐานข้อมูล) เพราะทุกหน้าสาธารณะโหลดหน้านี้ล่วงหน้าจากเมนู
export default function QuizPage() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        เรียนธรรมศึกษาทีละหน่วย: ทำแบบทดสอบก่อนเรียน อ่านบทเรียน แล้วทำแบบทดสอบหลังเรียน หรือทดสอบรวมทั้งวิชาแบบจับเวลา
        ใช้ได้โดยไม่ต้องเข้าสู่ระบบ ถ้าเข้าสู่ระบบ ระบบจะเก็บประวัติการเรียนไว้ให้
      </p>
      <div className="mt-6">
        <CoursePicker />
      </div>
      <p className="mt-8">
        <Link href="/quiz/my" prefetch={false} className="font-semibold text-primary underline underline-offset-4">
          ผลการเรียนของฉัน
        </Link>{" "}
        <span className="text-muted-foreground">(ความคืบหน้า ประวัติ และกราฟพัฒนาการ สำหรับผู้ที่เข้าสู่ระบบ)</span>
      </p>
    </section>
  );
}
