import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { History, ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { examName } from "@/lib/exam-forms";
import { RESULT_STATUS_LABEL } from "@/lib/exam-results";
import { fetchResultRounds } from "@/lib/exam-results-server";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "ผลสอบ" };
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("th-TH");

/** ผลสอบ (ส่วนกลาง): รายการรอบ ยอดผล สถานะประกาศ ผู้อื่นไปหน้าบัญชีผู้สอบได้ */
export default async function ResultsPage() {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds) redirect("/app/exams/results/lists");
  const rounds = await fetchResultRounds();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams" className="text-primary underline underline-offset-4">
          สมัครสอบและผลสอบ
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">ผลสอบ</h1>
          <p className="mt-1 text-muted-foreground">
            นำเข้าผลสอบจาก Excel ตรวจ แก้ไข แล้วประกาศผลทีละรอบ ก่อนประกาศ หน้าสาธารณะและหน่วยงานในเขตยังไม่เห็นผลของรอบนั้น
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/app/exams/results/lists" prefetch={false}>
              <ListChecks aria-hidden />
              บัญชีผู้สอบได้ ศ.๔ ศ.๘
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/exams/results/history" prefetch={false}>
              <History aria-hidden />
              ผลสอบได้ย้อนหลัง
            </Link>
          </Button>
        </div>
      </div>

      {rounds.length === 0 ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="result-rounds-empty">
          ยังไม่มีรอบที่เคยเปิดรับสมัคร
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[48rem] border-collapse text-left" data-testid="result-rounds">
            <thead className="bg-secondary text-sm">
              <tr>
                <th scope="col" className="px-3 py-2">รอบ</th>
                <th scope="col" className="px-3 py-2">สถานะผล</th>
                <th scope="col" className="px-3 py-2 text-right">ผู้สมัคร</th>
                <th scope="col" className="px-3 py-2 text-right">มีผลแล้ว</th>
                <th scope="col" className="px-3 py-2 text-right">สอบได้</th>
                <th scope="col" className="px-3 py-2 text-right">สอบตก</th>
                <th scope="col" className="px-3 py-2 text-right">ขาดสอบ</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.id} className="border-t" data-testid="result-round">
                  <td className="px-3 py-2">
                    <Link href={`/app/exams/results/${r.id}`} prefetch={false} className="font-semibold text-primary underline underline-offset-4">
                      {examName(r.exam_type, r.level)} {r.year_be}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-sm font-medium",
                        r.result_status === "published" ? "bg-green-100 text-green-900" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {RESULT_STATUS_LABEL[r.result_status]}
                    </span>
                    {r.results_announced_on ? <span className="block text-sm text-muted-foreground">ประกาศ {thaiDate(r.results_announced_on, "short")}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{n(r.candidates)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n(r.results)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n(r.passed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n(r.failed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n(r.absent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
