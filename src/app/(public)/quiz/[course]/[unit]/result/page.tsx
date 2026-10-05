import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QUIZ_BASE, courseSlug } from "@/lib/quiz";
import { fetchUnitResult, fetchUnitState, fetchUnitWeakLessons } from "@/lib/quiz-learn-server";
import { thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ course: string; unit: string }> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "สรุปผลของหน่วย", robots: { index: false } };

const n = (value: number) => value.toLocaleString("th-TH");
const percent = (score: number, total: number) => (total > 0 ? Math.round((score / total) * 100) : 0);

/** แถบคะแนนแบบเทียบกัน: สีเดียว 2 ระดับ (ก่อนเรียนอ่อน หลังเรียนเข้ม) ตัวเลขอยู่ข้างแถบเสมอ */
function ScoreBar({ label, score, total, tone }: { label: string; score: number; total: number; tone: "before" | "after" }) {
  const value = percent(score, total);
  return (
    <div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums">
          <strong>
            {n(score)}/{n(total)}
          </strong>{" "}
          <span className="text-muted-foreground">(ร้อยละ {n(value)})</span>
        </span>
      </p>
      <div className="mt-1 h-4 rounded-r-[4px] bg-muted" aria-hidden>
        <div
          className={cn("h-4 rounded-r-[4px]", tone === "before" ? "bg-[#dcc58e]" : "bg-[#8a6508]")}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default async function QuizUnitResultPage({ params }: Props) {
  const { unit: unitId } = await params;
  const state = await fetchUnitState(unitId);
  if (!state) notFound();
  const unitHref = `${QUIZ_BASE}/${courseSlug(state)}/${state.unit_id}`;
  const [result, topics] = await Promise.all([fetchUnitResult(state.unit_id), fetchUnitWeakLessons(state.unit_id)]);

  const hasPost = Boolean(result?.post_id);
  const pre = result ? percent(result.pre_score, result.pre_total) : 0;
  const post = result && hasPost ? percent(result.post_score ?? 0, result.post_total ?? 0) : 0;
  const diff = post - pre;
  const stillWrong = topics.filter((t) => t.lesson_id && t.post_wrong > 0);
  const unlinkedWrong = topics.find((t) => !t.lesson_id)?.post_wrong ?? 0;
  const fixed = topics.filter((t) => t.lesson_id && t.pre_wrong > 0 && t.post_asked > 0 && t.post_wrong === 0);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p>
        <Link href={unitHref} className="text-primary underline underline-offset-4">
          ← {state.unit_name}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">สรุปผล: {state.unit_name}</h1>
      <p className="mt-1 text-muted-foreground">{state.course_name}</p>

      {!result ? (
        <div className="mt-6 rounded-xl border bg-card p-5" data-testid="result-empty">
          <p>ยังไม่มีผลของหน่วยนี้ เริ่มจากแบบทดสอบก่อนเรียนก่อน</p>
          <div className="mt-3">
            <Button asChild className="min-h-12 w-full px-6 text-lg sm:w-auto">
              <Link href={unitHref}>ไปหน้าหน่วยการเรียน</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-xl border bg-card p-5" data-testid="result-compare">
            <h2 className="text-xl font-bold text-primary">คะแนนก่อนเรียนเทียบหลังเรียน</h2>
            <div className="mt-4 flex flex-col gap-3">
              <ScoreBar label="ก่อนเรียน" score={result.pre_score} total={result.pre_total} tone="before" />
              {hasPost ? (
                <ScoreBar label="หลังเรียน" score={result.post_score ?? 0} total={result.post_total ?? 0} tone="after" />
              ) : null}
            </div>
            {hasPost ? (
              <p
                className="mt-4 flex items-start gap-2 rounded-lg bg-secondary px-4 py-3 text-lg"
                data-testid="result-diff"
                data-diff={diff}
              >
                {diff > 0 ? (
                  <ArrowUpRight aria-hidden className="mt-0.5 size-6 shrink-0 text-green-700" />
                ) : diff < 0 ? (
                  <ArrowDownRight aria-hidden className="mt-0.5 size-6 shrink-0 text-destructive" />
                ) : (
                  <ArrowRight aria-hidden className="mt-0.5 size-6 shrink-0 text-muted-foreground" />
                )}
                <span>
                  ส่วนต่าง{" "}
                  <strong>
                    {diff > 0 ? "เพิ่มขึ้น" : diff < 0 ? "ลดลง" : "เท่าเดิม"}
                    {diff !== 0 ? ` ${n(Math.abs(diff))} จุดร้อยละ` : ""}
                  </strong>{" "}
                  (จากร้อยละ {n(pre)} เป็นร้อยละ {n(post)})
                </span>
              </p>
            ) : (
              <p className="mt-4 rounded-lg bg-secondary px-4 py-3" data-testid="result-no-post">
                ยังไม่ได้ส่งแบบทดสอบหลังเรียน จึงยังเทียบคะแนนไม่ได้
              </p>
            )}
            <p className="mt-3 text-sm text-muted-foreground">
              ก่อนเรียนส่งเมื่อ {thaiDateTime(result.pre_submitted_at)}
              {hasPost ? ` · หลังเรียนครั้งล่าสุดส่งเมื่อ ${thaiDateTime(result.post_submitted_at)}` : ""}
              {result.post_done_count > 1
                ? ` · ทำหลังเรียนแล้ว ${n(result.post_done_count)} ครั้ง คะแนนสูงสุด ${n(result.best_post_score ?? 0)}/${n(result.best_post_total ?? 0)}`
                : ""}
            </p>
          </div>

          {hasPost ? (
            <div className="mt-6 rounded-xl border bg-card p-5" data-testid="result-topics">
              <h2 className="text-xl font-bold text-primary">หัวข้อที่ยังตอบผิด</h2>
              {stillWrong.length === 0 && unlinkedWrong === 0 ? (
                <p className="mt-2">ตอบถูกทุกข้อในแบบทดสอบหลังเรียนครั้งล่าสุด ไม่มีหัวข้อที่ต้องทบทวน</p>
              ) : stillWrong.length === 0 ? (
                <p className="mt-2 text-muted-foreground">ข้อที่ตอบผิดไม่ได้ผูกกับบทเรียนหัวข้อใด ดูเฉลยรายข้อได้จากลิงก์ด้านล่าง</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {stillWrong.map((t) => (
                    <li key={t.lesson_id} data-topic={t.title} className="rounded-lg border border-amber-400 bg-amber-50 p-4">
                      <p className="text-lg font-semibold">{t.title}</p>
                      <p className="mt-1">
                        หลังเรียนตอบผิด {n(t.post_wrong)} จาก {n(t.post_asked)} ข้อ
                        {t.pre_asked > 0 ? ` · ก่อนเรียนตอบผิด ${n(t.pre_wrong)} จาก ${n(t.pre_asked)} ข้อ` : ""}
                      </p>
                      <p className="mt-2">
                        <Link
                          href={`${unitHref}/lessons#lesson-${t.lesson_id}`}
                          className="font-semibold text-primary underline underline-offset-4"
                        >
                          กลับไปอ่านบทเรียนหัวข้อนี้
                        </Link>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {unlinkedWrong > 0 && stillWrong.length > 0 ? (
                <p className="mt-3 text-muted-foreground">และตอบผิดอีก {n(unlinkedWrong)} ข้อที่ไม่ได้ผูกกับบทเรียนหัวข้อใด</p>
              ) : null}
              {fixed.length > 0 ? (
                <p className="mt-3" data-testid="result-fixed">
                  หัวข้อที่เคยตอบผิดก่อนเรียน และหลังเรียนตอบถูกครบแล้ว: {fixed.map((t) => t.title).join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            {hasPost && result.post_id ? (
              <Button asChild variant="outline" className="min-h-12 px-6 text-lg">
                <Link href={`${QUIZ_BASE}/attempt/${result.post_id}`} prefetch={false}>
                  ดูเฉลยรายข้อของหลังเรียน
                </Link>
              </Button>
            ) : null}
            <Button asChild className="min-h-12 px-6 text-lg">
              <Link href={unitHref}>{hasPost ? "กลับไปหน้าหน่วยการเรียน" : "ไปทำขั้นต่อไป"}</Link>
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
