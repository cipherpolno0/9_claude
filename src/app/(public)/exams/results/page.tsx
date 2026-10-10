import type { Metadata } from "next";
import Link from "next/link";

import { isExamLevel, isExamType } from "@/lib/exam-forms";
import { fetchPublicResultStats } from "@/lib/exam-results-server";

import { ResultsFinder, type ResultChoice } from "./results-finder";

export const metadata: Metadata = { title: "ค้นผลสอบ" };
/** หน้าคงที่ สร้างใหม่ทุก 5 นาที (เมนูสาธารณะโหลดล่วงหน้า) ตัวเลือกปี ประเภท ชั้น มาจากรอบที่ประกาศผลแล้ว */
export const revalidate = 300;

export default async function PublicResultsPage() {
  const stats = await fetchPublicResultStats();
  const seen = new Set<string>();
  const choices: ResultChoice[] = [];
  for (const s of stats) {
    const k = `${s.year_be}|${s.exam_type}|${s.level}`;
    if (seen.has(k) || !isExamType(s.exam_type) || !isExamLevel(s.level)) continue;
    seen.add(k);
    choices.push({ year: s.year_be, type: s.exam_type, level: s.level });
  }
  const order = { tri: 1, tho: 2, ek: 3 } as const;
  choices.sort((a, b) => b.year - a.year || a.type.localeCompare(b.type) || order[a.level] - order[b.level]);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
      <p className="text-sm">
        <Link href="/exams" className="text-primary underline underline-offset-4">
          สอบธรรมสนามหลวง
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ค้นผลสอบ</h1>
      <p className="mt-2 text-muted-foreground">
        ผลสอบนักธรรมและธรรมศึกษาที่ประกาศแล้ว แสดงเฉพาะผู้สอบได้ เลือกปี ประเภท ชั้น แล้วค้นด้วยชื่อ หรือดูรายชื่อตามจังหวัดและสำนัก
      </p>
      <ResultsFinder choices={choices} />
    </section>
  );
}
