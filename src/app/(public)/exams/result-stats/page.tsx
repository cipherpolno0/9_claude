import type { Metadata } from "next";
import Link from "next/link";

import { fetchPublicResultStats } from "@/lib/exam-results-server";

import { ResultStatsView } from "./result-stats-view";

export const metadata: Metadata = { title: "สถิติผลสอบ" };
/** หน้าคงที่ สร้างใหม่ทุก 5 นาที ตัวเลขรวมจาก public_result_stats เฉพาะรอบที่ประกาศผลแล้ว ไม่มีข้อมูลรายบุคคล */
export const revalidate = 300;

export default async function ResultStatsPage() {
  const rows = await fetchPublicResultStats();
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <p className="text-sm">
        <Link href="/exams" className="text-primary underline underline-offset-4">
          สอบธรรมสนามหลวง
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">สถิติผลสอบ</h1>
      <p className="mt-2 text-muted-foreground">
        จำนวนส่งสอบ ขาดสอบ คงสอบ สอบได้ สอบตก และร้อยละสอบได้ (สอบได้ ÷ คงสอบ ตามแบบบัญชี ศ.๔ ศ.๘) เฉพาะรอบที่ประกาศผลแล้ว
        ภาคและจังหวัดเป็นที่ตั้งของสนามสอบ ตัวเลขปรับทุก 5 นาที
      </p>
      <ResultStatsView rows={rows} />
    </section>
  );
}
