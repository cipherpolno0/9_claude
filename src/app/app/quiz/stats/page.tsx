import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { requireQuizManager } from "@/lib/auth/guards";
import { CHOICE_KEYS, CHOICE_LABEL, type ChoiceKey } from "@/lib/quiz";
import {
  DEFAULT_PROBLEM_PERCENT,
  DEFAULT_STATS_MIN_ANSWERS,
  fetchCourseStats,
  fetchQuestionStats,
  fetchStatsTotals,
  type QuestionStats,
} from "@/lib/quiz-server";
import { cn } from "@/lib/utils";

import { QuizNav } from "../quiz-nav";
import { StatsCourseFilter } from "./course-filter";

export const metadata: Metadata = { title: "สถิติคลังข้อสอบ" };
export const dynamic = "force-dynamic";

const n = (value: number) => value.toLocaleString("th-TH");
const pct = (value: number | null) => (value === null ? "-" : `${Number(value).toLocaleString("th-TH", { maximumFractionDigits: 1 })}`);
const short = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** ตัวเลือกที่ผู้ตอบเลือกมากที่สุด ถ้าไม่ใช่ข้อถูกและเกินครึ่งของผู้ตอบ = ควรตรวจเฉลย */
function suspectKey(q: QuestionStats): ChoiceKey | null {
  const counts: Record<ChoiceKey, number> = { a: q.n_a, b: q.n_b, c: q.n_c, d: q.n_d };
  const top = CHOICE_KEYS.reduce((best, key) => (counts[key] > counts[best] ? key : best), "a" as ChoiceKey);
  return top !== q.correct_choice && counts[top] * 2 > q.shown ? top : null;
}

function QuestionTable({ rows, testid }: { rows: QuestionStats[]; testid: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card" data-testid={testid}>
      <table className="w-full min-w-[52rem] border-collapse text-left">
        <thead>
          <tr className="border-b bg-secondary">
            <th scope="col" className="px-4 py-2">โจทย์</th>
            <th scope="col" className="px-4 py-2">รายวิชา / หน่วย</th>
            <th scope="col" className="w-24 px-4 py-2 text-right">ใช้ (ครั้ง)</th>
            <th scope="col" className="w-40 px-4 py-2">ตอบถูก (ร้อยละ)</th>
            <th scope="col" className="px-4 py-2">จำนวนที่เลือกแต่ละตัวเลือก</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => {
            const suspect = suspectKey(q);
            const counts: Record<ChoiceKey, number> = { a: q.n_a, b: q.n_b, c: q.n_c, d: q.n_d };
            return (
              <tr key={q.question_id} className="border-b align-top last:border-b-0" data-question={q.question_text}>
                <td className="px-4 py-2">
                  <Link href={`/app/quiz/questions/${q.question_id}`} className="font-semibold text-primary underline underline-offset-4">
                    {short(q.question_text)}
                  </Link>
                  {!q.is_active || q.status !== "published" ? (
                    <span className="block text-sm text-muted-foreground">
                      ({!q.is_active ? "ปิดใช้งานแล้ว" : "ถอนกลับเป็นร่างแล้ว"})
                    </span>
                  ) : null}
                  {suspect ? (
                    <span className="mt-1 flex items-start gap-1 text-sm font-semibold text-amber-900">
                      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                      ผู้ตอบเกินครึ่งเลือก {CHOICE_LABEL[suspect]} แต่เฉลยคือ {CHOICE_LABEL[q.correct_choice]} ควรตรวจเฉลย
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2">
                  {q.course_name}
                  <span className="block text-sm text-muted-foreground">{q.unit_name}</span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{n(q.shown)}</td>
                <td className="px-4 py-2">
                  <span className="tabular-nums">
                    <strong>{pct(q.correct_percent)}</strong>{" "}
                    <span className="text-sm text-muted-foreground">
                      ({n(q.correct)}/{n(q.shown)})
                    </span>
                  </span>
                  {/* แถบร้อยละ: ส่วนที่เหลือใช้สีอ่อนของสีเดียวกัน */}
                  <span className="mt-1 block h-2 rounded-full bg-[#f1e4bf]" aria-hidden>
                    <span className="block h-2 rounded-full bg-[#8a6508]" style={{ width: `${Math.min(100, Number(q.correct_percent))}%` }} />
                  </span>
                </td>
                <td className="px-4 py-2 tabular-nums">
                  {CHOICE_KEYS.map((key) => (
                    <span key={key} className={cn("mr-3 inline-block whitespace-nowrap", key === q.correct_choice ? "font-bold" : "")}>
                      {CHOICE_LABEL[key]} {n(counts[key])}
                      {key === q.correct_choice ? " (ข้อถูก)" : ""}
                    </span>
                  ))}
                  <span className="inline-block whitespace-nowrap text-muted-foreground">ไม่ตอบ {n(q.n_blank)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function QuizStatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireQuizManager();
  const query = await searchParams;
  const courseParam = typeof query.course === "string" ? query.course : "";
  const minShown = ctx.settings.quiz_stats_min_answers ?? DEFAULT_STATS_MIN_ANSWERS;
  const problemPercent = ctx.settings.quiz_problem_correct_percent ?? DEFAULT_PROBLEM_PERCENT;

  const [totals, courses] = await Promise.all([fetchStatsTotals(), fetchCourseStats()]);
  const courseId = courses.some((c) => c.course_id === courseParam) ? courseParam : "";
  const [problems, hardest] = await Promise.all([
    fetchQuestionStats({ courseId, minShown, maxPercent: problemPercent, limit: 200 }),
    fetchQuestionStats({ courseId, minShown, maxPercent: null, limit: 20 }),
  ]);

  const tiles = [
    {
      testid: "tile-takers",
      label: "ผู้ทำแบบทดสอบ",
      value: `${n(totals.takers)} ราย`,
      note: `เข้าสู่ระบบ ${n(totals.signed_in_takers)} บัญชี · ไม่เข้าสู่ระบบ ${n(totals.device_takers)} เครื่อง`,
    },
    { testid: "tile-attempts", label: "แบบทดสอบที่ส่งแล้ว", value: `${n(totals.attempts)} ครั้ง`, note: `ทำค้างยังไม่ส่ง ${n(totals.open_attempts)} ครั้ง` },
    {
      testid: "tile-problems",
      label: `ข้อที่อาจมีปัญหา${courseId ? " (รายวิชาที่เลือก)" : ""}`,
      value: `${n(problems.total)} ข้อ`,
      note: `ตอบถูกน้อยกว่าร้อยละ ${n(problemPercent)}`,
    },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">สถิติคลังข้อสอบ</h1>
      <p className="mt-1 text-muted-foreground">
        นับจากแบบทดสอบที่ส่งคำตอบแล้วเท่านั้น เป็นตัวเลขรวม ไม่แสดงข้อมูลของผู้เรียนรายคน ผู้ที่ไม่เข้าสู่ระบบนับตามเครื่อง
        คนเดียวกันที่ใช้หลายเครื่องจึงถูกนับมากกว่าหนึ่งราย
      </p>
      <QuizNav current="stats" />

      <ul className="mt-6 grid gap-3 sm:grid-cols-3" data-testid="stats-tiles">
        {tiles.map((t) => (
          <li key={t.testid} data-testid={t.testid} className="rounded-xl border bg-card p-4">
            <p className="text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-2xl font-bold text-primary">{t.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.note}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-xl font-bold text-primary">จำนวนผู้ทำและคะแนนเฉลี่ยต่อวิชา</h2>
      <p className="text-muted-foreground">
        คะแนนเฉลี่ยเป็นร้อยละ คอลัมน์ &quot;ทำครบทั้งก่อนและหลัง&quot; เทียบเฉพาะผู้ที่ทำทั้งสองแบบทดสอบของหน่วยเดียวกัน
        จึงเป็นตัวเลขที่ใช้ดูผลของการเรียนได้ตรงที่สุด
      </p>
      {courses.length === 0 ? (
        <p className="mt-3 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="stats-empty">
          ยังไม่มีแบบทดสอบที่ส่งแล้ว
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border bg-card" data-testid="stats-courses">
          <table className="w-full min-w-[56rem] border-collapse text-left">
            <thead>
              <tr className="border-b bg-secondary">
                <th scope="col" rowSpan={2} className="px-4 py-2 align-bottom">รายวิชา</th>
                <th scope="col" rowSpan={2} className="px-4 py-2 text-right align-bottom">ผู้ทำ (ราย)</th>
                <th scope="colgroup" colSpan={2} className="border-l px-4 py-2 text-center">ก่อนเรียน</th>
                <th scope="colgroup" colSpan={2} className="border-l px-4 py-2 text-center">หลังเรียน</th>
                <th scope="colgroup" colSpan={3} className="border-l px-4 py-2 text-center">ทำครบทั้งก่อนและหลัง</th>
                <th scope="colgroup" colSpan={2} className="border-l px-4 py-2 text-center">ทดสอบรวม</th>
              </tr>
              <tr className="border-b bg-secondary text-sm">
                <th scope="col" className="border-l px-4 py-1 text-right">ครั้ง</th>
                <th scope="col" className="px-4 py-1 text-right">เฉลี่ย</th>
                <th scope="col" className="border-l px-4 py-1 text-right">ครั้ง</th>
                <th scope="col" className="px-4 py-1 text-right">เฉลี่ย</th>
                <th scope="col" className="border-l px-4 py-1 text-right">คู่</th>
                <th scope="col" className="px-4 py-1 text-right">ก่อน → หลัง</th>
                <th scope="col" className="px-4 py-1 text-right">ส่วนต่าง</th>
                <th scope="col" className="border-l px-4 py-1 text-right">ครั้ง</th>
                <th scope="col" className="px-4 py-1 text-right">เฉลี่ย</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => {
                const gain = c.pair_count > 0 ? Number(c.pair_post_avg) - Number(c.pair_pre_avg) : null;
                return (
                  <tr key={c.course_id} className="border-b tabular-nums last:border-b-0" data-course={c.course_name}>
                    <th scope="row" className="px-4 py-2 font-semibold">{c.course_name}</th>
                    <td className="px-4 py-2 text-right">{n(c.takers)}</td>
                    <td className="border-l px-4 py-2 text-right">{n(c.pre_count)}</td>
                    <td className="px-4 py-2 text-right">{pct(c.pre_avg)}</td>
                    <td className="border-l px-4 py-2 text-right">{n(c.post_count)}</td>
                    <td className="px-4 py-2 text-right">{pct(c.post_avg)}</td>
                    <td className="border-l px-4 py-2 text-right">{n(c.pair_count)}</td>
                    <td className="px-4 py-2 text-right">
                      {c.pair_count > 0 ? `${pct(c.pair_pre_avg)} → ${pct(c.pair_post_avg)}` : "-"}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {gain === null ? "-" : `${gain > 0 ? "+" : gain < 0 ? "−" : ""}${pct(Math.abs(gain))}`}
                    </td>
                    <td className="border-l px-4 py-2 text-right">{n(c.full_count)}</td>
                    <td className="px-4 py-2 text-right">{pct(c.full_avg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 text-xl font-bold text-primary">สถิติรายข้อ</h2>
      <p className="text-muted-foreground">
        นับเฉพาะข้อที่ถูกใช้ในแบบทดสอบที่ส่งแล้วอย่างน้อย {n(minShown)} ครั้ง ข้อที่ไม่ตอบนับเป็นตอบผิด
        ร้อยละคิดจากเฉลยปัจจุบันของข้อนั้น
        {ctx.isAdmin ? " (ผู้ดูแลระบบปรับจำนวนครั้งขั้นต่ำและเกณฑ์ร้อยละได้ที่หน้า บทบาทและค่าตั้ง)" : ""}
      </p>
      <div className="mt-3">
        <StatsCourseFilter courses={courses.map((c) => ({ id: c.course_id, name: c.course_name }))} value={courseId} />
      </div>

      <h3 className="mt-6 flex flex-wrap items-center gap-2 text-lg font-bold text-primary">
        <AlertTriangle aria-hidden className="size-5 text-amber-700" />
        ข้อที่อาจมีปัญหา: ตอบถูกน้อยกว่าร้อยละ {n(problemPercent)} ({n(problems.total)} ข้อ)
      </h3>
      <p className="text-muted-foreground">
        ข้อกลุ่มนี้ควรเปิดตรวจ: เฉลยอาจผิด โจทย์หรือตัวเลือกอาจกำกวม หรือเนื้อหายังไม่ได้สอนในบทเรียน
      </p>
      <div className="mt-3">
        {problems.rows.length === 0 ? (
          <p className="rounded-xl border bg-card p-5 text-muted-foreground" data-testid="stats-problems-empty">
            ไม่มีข้อที่เข้าเกณฑ์
          </p>
        ) : (
          <QuestionTable rows={problems.rows} testid="stats-problems" />
        )}
      </div>

      <h3 className="mt-8 text-lg font-bold text-primary">ข้อที่ตอบผิดมากที่สุด 20 อันดับ</h3>
      <div className="mt-3">
        {hardest.rows.length === 0 ? (
          <p className="rounded-xl border bg-card p-5 text-muted-foreground" data-testid="stats-hardest-empty">
            ยังไม่มีข้อที่ถูกใช้ถึง {n(minShown)} ครั้ง
          </p>
        ) : (
          <QuestionTable rows={hardest.rows} testid="stats-hardest" />
        )}
      </div>
    </section>
  );
}
