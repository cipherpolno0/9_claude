import type { Metadata } from "next";
import Link from "next/link";

import { fetchPublicStats } from "@/lib/exam-batches-server";

import { StatsView } from "./stats-view";

export const metadata: Metadata = { title: "สถิติสมัครสอบ" };
/** หน้าคงที่ สร้างใหม่ทุก 5 นาที (เมนูสาธารณะโหลดล่วงหน้า) ตัวเลขมาจาก public_registration_stats ไม่มีข้อมูลรายบุคคล */
export const revalidate = 300;

export default async function ExamStatsPage() {
  const rows = await fetchPublicStats();
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <p className="text-sm">
        <Link href="/exams" className="text-primary underline underline-offset-4">
          สอบธรรมสนามหลวง
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">สถิติสมัครสอบ</h1>
      <p className="mt-2 text-muted-foreground">
        จำนวนผู้สมัครสอบนักธรรมและธรรมศึกษา นับจากบัญชีที่สำนักส่งแล้ว (รวมที่อยู่ระหว่างรับรอง) ภาคและจังหวัดเป็นที่ตั้งของสนามสอบ
        ตัวเลขปรับทุก 5 นาที
      </p>
      <StatsView rows={rows} />
    </section>
  );
}
