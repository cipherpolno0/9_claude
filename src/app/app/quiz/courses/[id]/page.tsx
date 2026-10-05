import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireQuizManager } from "@/lib/auth/guards";
import { COURSE_LEVEL_LABEL, COURSE_STAGE_LABEL, COURSE_SUBJECT_LABEL } from "@/lib/quiz";
import { fetchBankSummary, fetchCourse, fetchUnits } from "@/lib/quiz-server";

import { FactRow } from "../../../personnel/person-facts";
import { UnitsManager } from "./units-manager";

export const metadata: Metadata = { title: "หน่วยการเรียนของรายวิชา" };
export const dynamic = "force-dynamic";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  await requireQuizManager();
  const { id } = await params;
  const course = await fetchCourse(id);
  if (!course) notFound();
  const [units, summary] = await Promise.all([fetchUnits(course.id), fetchBankSummary()]);
  const counts = new Map((summary.find((c) => c.id === course.id)?.units ?? []).map((u) => [u.id, u]));

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p>
        <Link href="/app/quiz/courses" className="text-primary underline underline-offset-4">
          ← รายวิชาและหน่วยการเรียน
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">{course.name}</h1>
      <dl className="mt-4 rounded-xl border bg-card px-5 py-2" data-testid="course-facts">
        <FactRow label="รหัสรายวิชา">{course.code}</FactRow>
        <FactRow label="ชั้น">{COURSE_LEVEL_LABEL[course.level]}</FactRow>
        <FactRow label="ช่วงชั้น">{COURSE_STAGE_LABEL[course.stage]}</FactRow>
        <FactRow label="วิชา">{COURSE_SUBJECT_LABEL[course.subject]}</FactRow>
        <FactRow label="รูปแบบข้อสอบ">
          {course.has_mcq ? "ปรนัย 4 ตัวเลือก" : "ข้อเขียน (ไม่มีข้อสอบปรนัย มีเฉพาะบทเรียนและตัวอย่าง ซึ่งเพิ่มในบทถัดไป)"}
        </FactRow>
      </dl>

      <UnitsManager
        courseId={course.id}
        courseName={course.name}
        hasMcq={course.has_mcq}
        units={units.map((u) => ({
          id: u.id,
          name: u.name,
          is_active: u.is_active,
          published: counts.get(u.id)?.published ?? 0,
          draft: counts.get(u.id)?.draft ?? 0,
        }))}
      />
    </section>
  );
}
