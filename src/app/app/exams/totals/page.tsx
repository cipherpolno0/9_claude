import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { fetchVenueTotals } from "@/lib/exam-batches-server";
import { examName } from "@/lib/exam-forms";
import { fetchExamRounds } from "@/lib/exam-forms-server";
import { pivotVenueTotals, stageLabel } from "@/lib/exam-totals";

export const metadata: Metadata = { title: "ยอดผู้สมัครต่อสนามสอบ" };
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("th-TH");
const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** ยอดผู้สมัครต่อสนามสอบของรอบ สำหรับส่วนกลางใช้จัดเตรียมข้อสอบ (นับบัญชีที่ส่งแล้ว รวมระหว่างรับรอง) */
export default async function VenueTotalsPage({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds) redirect("/app/exams?denied=1");
  const sp = await searchParams;
  const rounds = (await fetchExamRounds()).filter((r) => r.is_active);
  const round = rounds.find((r) => r.id === sp.round) ?? rounds.find((r) => r.status !== "draft") ?? rounds[0] ?? null;
  const result = round ? await fetchVenueTotals(round.id) : { ok: true as const, rows: [] };
  const table = pivotVenueTotals(result.ok ? result.rows : []);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams" className="text-primary underline underline-offset-4">
          สมัครสอบและผลสอบ
        </Link>{" "}
        /{" "}
        <Link href="/app/exams/batches" className="text-primary underline underline-offset-4">
          บัญชีผู้สมัครสอบ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ยอดผู้สมัครต่อสนามสอบ</h1>
      <p className="mt-1 text-muted-foreground">
        นับจากบัญชีที่ส่งแล้ว รวมที่อยู่ระหว่างรับรอง (ไม่นับบัญชีที่ยังไม่ส่งหรือถอนแล้ว) ใช้จัดเตรียมข้อสอบรายสนาม
      </p>

      <form className="mt-4 flex flex-wrap items-end gap-2" action="/app/exams/totals">
        <label className="flex min-w-64 flex-col gap-1">
          <span className="text-sm text-muted-foreground">รอบสมัครสอบ</span>
          <select name="round" defaultValue={round?.id ?? ""} className={selectClass}>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {examName(r.exam_type, r.level)} ปีการศึกษา {r.year_be}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          แสดง
        </Button>
        {round ? (
          <a
            href={`/app/exams/totals/export?round=${round.id}`}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90"
            data-testid="totals-export"
          >
            <Download className="size-5" aria-hidden />
            ส่งออก Excel
          </a>
        ) : null}
      </form>

      {!result.ok ? <p role="alert" className="mt-4 text-destructive">{result.error}</p> : null}
      {round ? (
        <p className="mt-4" data-testid="totals-summary">
          {examName(round.exam_type, round.level)} {round.year_be}: {n(table.rows.length)} สนามสอบ · ผู้สมัคร {n(table.totals.total)} คน ·
          รับรองแล้ว {n(table.totals.certified)} คน · {n(table.totals.accounts)} บัญชี
        </p>
      ) : (
        <p className="mt-4 text-muted-foreground">ยังไม่มีรอบสมัครสอบ</p>
      )}

      {table.rows.length ? (
        <div className="mt-3 overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[48rem] border-collapse text-left" data-testid="totals-table">
            <thead className="bg-secondary text-sm">
              <tr>
                <th scope="col" className="px-3 py-2">รหัสสนาม</th>
                <th scope="col" className="px-3 py-2">สนามสอบ</th>
                <th scope="col" className="px-3 py-2">ภาค</th>
                <th scope="col" className="px-3 py-2">จังหวัด</th>
                {table.stages.map((s) => (
                  <th key={s} scope="col" className="px-3 py-2 text-right">
                    {stageLabel(s)}
                  </th>
                ))}
                {table.stages.length > 1 ? <th scope="col" className="px-3 py-2 text-right">รวม</th> : null}
                <th scope="col" className="px-3 py-2 text-right">รับรองแล้ว</th>
                <th scope="col" className="px-3 py-2 text-right">บัญชี (รอรับรอง)</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r.venue_code} className="border-t">
                  <td className="px-3 py-2">{r.venue_code}</td>
                  <td className="px-3 py-2">{r.venue_name}</td>
                  <td className="px-3 py-2">{r.region_name || "-"}</td>
                  <td className="px-3 py-2">{r.province_name || "-"}</td>
                  {r.byStage.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">
                      {n(v)}
                    </td>
                  ))}
                  {table.stages.length > 1 ? <td className="px-3 py-2 text-right font-semibold tabular-nums">{n(r.total)}</td> : null}
                  <td className="px-3 py-2 text-right tabular-nums">{n(r.certified)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {n(r.accounts)} ({n(r.pendingAccounts)})
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 font-semibold">
              <tr>
                <td className="px-3 py-2" colSpan={4}>
                  รวมทั้งหมด
                </td>
                {table.totals.byStage.map((v, i) => (
                  <td key={i} className="px-3 py-2 text-right tabular-nums">
                    {n(v)}
                  </td>
                ))}
                {table.stages.length > 1 ? <td className="px-3 py-2 text-right tabular-nums">{n(table.totals.total)}</td> : null}
                <td className="px-3 py-2 text-right tabular-nums">{n(table.totals.certified)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(table.totals.accounts)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : round ? (
        <p className="mt-3 rounded-xl border bg-card p-5 text-muted-foreground">ยังไม่มีบัญชีที่ส่งในรอบนี้</p>
      ) : null}
    </section>
  );
}
