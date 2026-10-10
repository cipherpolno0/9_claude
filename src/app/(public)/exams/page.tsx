import type { Metadata } from "next";
import Link from "next/link";
import { Award, BarChart3, PieChart, UserSearch } from "lucide-react";

import { findPublicMenu } from "@/lib/site";

const menu = findPublicMenu("/exams");

export const metadata: Metadata = { title: menu.title };

/** หน้านี้เป็นหน้าคงที่ (ไม่อ่านฐานข้อมูล) เพราะทุกหน้าสาธารณะโหลดล่วงหน้าจากเมนู */
export default function ExamsPage() {
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      <p className="mt-2 text-muted-foreground">{menu.description}</p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2" data-testid="exams-menu">
        <li>
          <Link href="/exams/check" prefetch={false} className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 hover:bg-secondary">
            <UserSearch className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block text-lg font-semibold text-primary">ตรวจรายชื่อผู้ขอเข้าสอบ</span>
              <span className="block text-muted-foreground">ค้นด้วยชื่อ นามสกุลหรือฉายา และปี ว่าสำนักส่งรายชื่อเข้าสอบชั้นใด สนามสอบใด</span>
            </span>
          </Link>
        </li>
        <li>
          <Link href="/exams/stats" prefetch={false} className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 hover:bg-secondary">
            <BarChart3 className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block text-lg font-semibold text-primary">สถิติสมัครสอบ</span>
              <span className="block text-muted-foreground">
                จำนวนผู้สมัครสอบนักธรรมและธรรมศึกษา แยกตามปี ประเภท ชั้น ช่วงชั้น ภาค และจังหวัด
              </span>
            </span>
          </Link>
        </li>
        <li>
          <Link href="/exams/results" prefetch={false} className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 hover:bg-secondary">
            <Award className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block text-lg font-semibold text-primary">ค้นผลสอบ</span>
              <span className="block text-muted-foreground">รายชื่อผู้สอบได้ที่ประกาศแล้ว ค้นด้วยชื่อ หรือดูตามจังหวัดและสำนัก</span>
            </span>
          </Link>
        </li>
        <li>
          <Link href="/exams/result-stats" prefetch={false} className="flex h-full items-start gap-3 rounded-xl border bg-card p-4 hover:bg-secondary">
            <PieChart className="mt-1 size-6 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block text-lg font-semibold text-primary">สถิติผลสอบ</span>
              <span className="block text-muted-foreground">ส่งสอบ ขาดสอบ สอบได้ ร้อยละสอบได้ แยกปี ชั้น ภาค จังหวัด</span>
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
