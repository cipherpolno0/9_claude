import type { Metadata } from "next";
import Link from "next/link";

import { requireQuizManager } from "@/lib/auth/guards";
import { isUuid } from "@/lib/persons-server";
import { fetchCourses, fetchLessonCounts, fetchLessons, fetchUnits } from "@/lib/quiz-server";
import { createClient } from "@/lib/supabase/server";

import { QuizNav } from "../quiz-nav";
import { LessonList } from "./lesson-list";
import { LessonScopePicker } from "./scope-picker";

export const metadata: Metadata = { title: "บทเรียน" };
export const dynamic = "force-dynamic";

const n = (value: number) => value.toLocaleString("th-TH");

export default async function LessonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireQuizManager();
  const query = await searchParams;
  const courses = await fetchCourses();
  const course = courses.find((c) => c.id === query.course) ?? null;
  const units = course ? (await fetchUnits(course.id)).filter((u) => u.is_active) : [];
  const unit = units.find((u) => u.id === query.unit) ?? null;

  const [lessons, counts, linked] = await Promise.all([
    unit ? fetchLessons(unit.id) : Promise.resolve([]),
    course && !unit ? fetchLessonCounts(course.id) : Promise.resolve(new Map<string, { total: number; published: number }>()),
    unit ? countLinkedQuestions(unit.id) : Promise.resolve(new Map<string, number>()),
  ]);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">บทเรียน</h1>
      <p className="mt-1 text-muted-foreground">
        บทเรียนของแต่ละหน่วยการเรียน ผู้เรียนเปิดได้หลังส่งแบบทดสอบก่อนเรียน เลือกรายวิชาและหน่วยเพื่อเพิ่มหรือแก้ไขบทเรียน
      </p>
      <QuizNav current="lessons" />

      <div className="mt-6 flex flex-col gap-6">
        <LessonScopePicker
          courses={courses.map((c) => ({ id: c.id, name: c.name }))}
          units={units.map((u) => ({ id: u.id, name: u.name }))}
          courseId={course?.id ?? ""}
          unitId={unit?.id ?? ""}
        />

        {!course ? (
          <p className="rounded-xl border bg-card p-5 text-muted-foreground">เลือกรายวิชาเพื่อดูหน่วยการเรียนและบทเรียน</p>
        ) : !unit ? (
          <div className="overflow-x-auto rounded-xl border bg-card" data-testid="lesson-units">
            <table className="w-full min-w-[32rem] border-collapse text-left">
              <thead>
                <tr className="border-b bg-secondary">
                  <th scope="col" className="px-4 py-2">หน่วยการเรียน</th>
                  <th scope="col" className="w-32 px-4 py-2 text-right">บทเรียน</th>
                  <th scope="col" className="w-32 px-4 py-2 text-right">เผยแพร่แล้ว</th>
                </tr>
              </thead>
              <tbody>
                {units.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-muted-foreground">
                      รายวิชานี้ยังไม่มีหน่วยการเรียน{" "}
                      <Link href={`/app/quiz/courses/${course.id}`} className="text-primary underline underline-offset-4">
                        เพิ่มหน่วยก่อน
                      </Link>
                    </td>
                  </tr>
                ) : null}
                {units.map((u) => (
                  <tr key={u.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2">
                      <Link
                        href={`/app/quiz/lessons?course=${course.id}&unit=${u.id}`}
                        className="font-semibold text-primary underline underline-offset-4"
                      >
                        {u.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right">{n(counts.get(u.id)?.total ?? 0)}</td>
                    <td className="px-4 py-2 text-right">{n(counts.get(u.id)?.published ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <LessonList
            key={unit.id}
            unitId={unit.id}
            hasMcq={course.has_mcq}
            lessons={lessons.map((l) => ({
              id: l.id,
              title: l.title,
              status: l.status,
              is_active: l.is_active,
              blockCount: Array.isArray(l.blocks) ? l.blocks.length : 0,
              questionCount: linked.get(l.id) ?? 0,
            }))}
          />
        )}
      </div>
    </section>
  );
}

/** จำนวนข้อสอบที่ใช้งานซึ่งผูกกับบทเรียนแต่ละหัวข้อของหน่วย */
async function countLinkedQuestions(unitId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!isUuid(unitId)) return counts;
  const supabase = await createClient();
  const { data } = await supabase
    .from("questions")
    .select("lesson_id")
    .eq("unit_id", unitId)
    .eq("is_active", true)
    .not("lesson_id", "is", null)
    .limit(5000);
  for (const row of (data as { lesson_id: string }[] | null) ?? []) counts.set(row.lesson_id, (counts.get(row.lesson_id) ?? 0) + 1);
  return counts;
}
