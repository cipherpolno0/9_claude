import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ATTEMPT_KIND_LABEL, QUIZ_BASE, courseSlug, durationText } from "@/lib/quiz";
import { fetchMyProgress, fetchMyQuizHistory, isSignedIn } from "@/lib/quiz-learn-server";
import { thaiDate, thaiDateTime } from "@/lib/thai";

import { ScoreChart, type ScorePoint } from "./score-chart";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ผลการเรียนของฉัน", robots: { index: false } };

const n = (value: number) => value.toLocaleString("th-TH");

export default async function QuizMyPage() {
  // หน้านี้เป็นของผู้ที่ล็อกอินเท่านั้น (ผู้ไม่ล็อกอินดูผลรายหน่วยได้จากหน้าหน่วยการเรียนในเครื่องเดิม)
  if (!(await isSignedIn())) redirect(`/login?next=${encodeURIComponent(`${QUIZ_BASE}/my`)}`);
  const [progress, history] = await Promise.all([fetchMyProgress(), fetchMyQuizHistory()]);

  const courseIdByName = new Map(progress.map((p) => [p.course_name, p.course_id]));
  // กราฟ: หลังเรียนและทดสอบรวม เรียงจากเก่าไปใหม่ (ประวัติเรียงจากใหม่ไปเก่า)
  const points: ScorePoint[] = [...history]
    .reverse()
    .filter((h) => h.kind !== "pre" && h.total > 0)
    .map((h) => ({
      id: h.id,
      courseId: courseIdByName.get(h.course_name) ?? h.course_name,
      kind: h.kind as "post" | "full",
      label: h.unit_name ?? "ทดสอบรวมทั้งวิชา",
      percent: Math.round((h.score / h.total) * 100),
      scoreText: `${n(h.score)}/${n(h.total)}`,
      dateText: thaiDate(h.submitted_at, "short"),
    }));
  const chartCourses = progress
    .filter((p) => points.some((pt) => pt.courseId === p.course_id))
    .map((p) => ({ id: p.course_id, name: p.course_name }));

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">ผลการเรียนของฉัน</h1>
          <p className="mt-1 text-muted-foreground">
            ความคืบหน้า ประวัติ และพัฒนาการ จากแบบทดสอบที่ท่านส่งขณะเข้าสู่ระบบ (ที่ทำตอนไม่ได้เข้าสู่ระบบไม่รวมอยู่ในหน้านี้)
          </p>
        </div>
        <Button asChild>
          <Link href={QUIZ_BASE}>ไปหน้าเรียน</Link>
        </Button>
      </div>

      <h2 className="mt-8 text-xl font-bold text-primary">ความคืบหน้าทุกวิชา</h2>
      {progress.length === 0 ? (
        <p className="mt-3 rounded-xl border bg-card p-5 text-muted-foreground">ยังไม่มีรายวิชาที่เปิดให้ทำแบบทดสอบ</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="my-progress">
          {progress.map((p) => {
            const ratio = p.unit_total > 0 ? Math.min(100, Math.round((p.unit_done / p.unit_total) * 100)) : 0;
            return (
              <li key={p.course_id} data-course={courseSlug(p)} className="rounded-xl border bg-card p-4">
                <Link href={`${QUIZ_BASE}/${courseSlug(p)}`} prefetch={false} className="text-lg font-semibold text-primary underline underline-offset-4">
                  {p.course_name}
                </Link>
                <p className="mt-2">
                  ทำหลังเรียนแล้ว <strong>{n(p.unit_done)}</strong> จาก {n(p.unit_total)} หน่วย
                  {p.unit_started > p.unit_done ? ` · กำลังเรียน ${n(p.unit_started - p.unit_done)} หน่วย` : ""}
                </p>
                {/* แถบความคืบหน้า: ส่วนที่ยังไม่ทำใช้สีอ่อนของสีเดียวกัน */}
                <div className="mt-1 h-2 rounded-full bg-[#f1e4bf]" aria-hidden>
                  <div className="h-2 rounded-full bg-[#8a6508]" style={{ width: `${ratio}%` }} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {p.post_avg_percent !== null ? `คะแนนหลังเรียนเฉลี่ยร้อยละ ${n(p.post_avg_percent)}` : "ยังไม่มีคะแนนหลังเรียน"}
                  {p.full_count > 0 ? ` · ทดสอบรวม ${n(p.full_count)} ครั้ง สูงสุดร้อยละ ${n(p.full_best_percent ?? 0)}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-8 text-xl font-bold text-primary">กราฟพัฒนาการ</h2>
      <div className="mt-3 rounded-xl border bg-card p-5">
        {chartCourses.length === 0 ? (
          <p className="text-muted-foreground" data-testid="chart-empty">
            ยังไม่มีข้อมูลสำหรับกราฟ กราฟจะแสดงเมื่อท่านส่งแบบทดสอบหลังเรียนหรือทดสอบรวมทั้งวิชาอย่างน้อย 1 ครั้ง
          </p>
        ) : (
          <ScoreChart points={points} courses={chartCourses} />
        )}
      </div>

      <h2 className="mt-8 text-xl font-bold text-primary">ประวัติการทำแบบทดสอบ</h2>
      {history.length === 0 ? (
        <p className="mt-3 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="history-empty">
          ยังไม่มีประวัติ เริ่มเรียนได้ที่หน้าเรียน ระบบจะเก็บผลไว้ที่นี่เมื่อท่านส่งคำตอบขณะเข้าสู่ระบบ
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border bg-card" data-testid="quiz-history">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr className="border-b bg-secondary">
                <th scope="col" className="px-4 py-2">วันที่ส่ง</th>
                <th scope="col" className="px-4 py-2">รายวิชา / หน่วย</th>
                <th scope="col" className="px-4 py-2">ชนิด</th>
                <th scope="col" className="px-4 py-2 text-right">คะแนน</th>
                <th scope="col" className="px-4 py-2">เวลาที่ใช้</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 whitespace-nowrap">{thaiDateTime(h.submitted_at)}</td>
                  <td className="px-4 py-2">
                    {h.course_name}
                    {h.unit_name ? (
                      <Link
                        href={`${QUIZ_BASE}/${courseSlug(h)}/${h.unit_id}/result`}
                        prefetch={false}
                        className="block text-sm text-primary underline underline-offset-4"
                      >
                        {h.unit_name}
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">{ATTEMPT_KIND_LABEL[h.kind]}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    <Link href={`${QUIZ_BASE}/attempt/${h.id}`} prefetch={false} className="text-primary underline underline-offset-4">
                      {n(h.score)}/{n(h.total)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{durationText(h.duration_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
