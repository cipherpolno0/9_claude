import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import {
  BATCH_SCOPE_LABEL,
  BATCH_SCOPES,
  BATCH_STATUS_CLASS,
  BATCH_STATUS_LABEL,
  BATCH_STATUSES,
  isBatchStatus,
  type BatchScope,
} from "@/lib/exam-batches";
import { fetchAccounts } from "@/lib/exam-batches-server";
import { examName } from "@/lib/exam-forms";
import { fetchExamRounds } from "@/lib/exam-forms-server";
import { thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "บัญชีผู้สมัครสอบ" };
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("th-TH");
const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; scope?: string; round?: string }>;
}) {
  const ctx = await requireMenu("/app/exams");
  const sp = await searchParams;
  const status = isBatchStatus(sp.status) ? sp.status : null;
  const scope: BatchScope = (BATCH_SCOPES as readonly string[]).includes(sp.scope ?? "") ? (sp.scope as BatchScope) : "all";
  const round = sp.round && /^[0-9a-f-]{36}$/i.test(sp.round) ? sp.round : null;
  const [accounts, rounds] = await Promise.all([fetchAccounts(scope, status, round), fetchExamRounds()]);
  const totalCandidates = accounts.reduce((sum, a) => sum + (a.status === "withdrawn" ? 0 : a.saved_count), 0);

  const link = (next: { scope?: BatchScope; status?: string | null }) => {
    const q = new URLSearchParams();
    const sc = next.scope ?? scope;
    const st = next.status === undefined ? status : next.status;
    if (sc !== "all") q.set("scope", sc);
    if (st) q.set("status", st);
    if (round) q.set("round", round);
    const qs = q.toString();
    return `/app/exams/batches${qs ? `?${qs}` : ""}`;
  };
  const statuses = scope === "area" ? (["submitted", "returned", "certified"] as const) : BATCH_STATUSES;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams" className="text-primary underline underline-offset-4">
          สมัครสอบและผลสอบ
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">บัญชีผู้สมัครสอบ</h1>
          <p className="mt-1 text-muted-foreground">
            หนึ่งบัญชีต่อ รอบ + สำนัก + สนามสอบ ท่านเห็นบัญชีที่ท่านอัปโหลด เจ้าคณะ รองเจ้าคณะ และเลขานุการเห็นบัญชีในเขตของตน
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ctx.canManageExamRounds ? (
            <Button asChild variant="outline">
              <Link href="/app/exams/totals" prefetch={false}>
                ยอดผู้สมัครต่อสนามสอบ
              </Link>
            </Button>
          ) : null}
          <Link
            href="/app/exams/batches/new"
            prefetch={false}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Upload className="size-5" aria-hidden />
            อัปโหลดไฟล์
          </Link>
        </div>
      </div>

      <nav aria-label="ขอบเขต" className="mt-6 flex flex-wrap gap-2 border-b pb-3">
        {BATCH_SCOPES.map((s) => (
          <Link
            key={s}
            href={link({ scope: s, status: null })}
            prefetch={false}
            aria-current={s === scope ? "page" : undefined}
            className={cn(
              "rounded-md px-4 py-2 font-medium",
              s === scope ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary",
            )}
          >
            {BATCH_SCOPE_LABEL[s]}
          </Link>
        ))}
      </nav>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="กรองตามสถานะ" className="flex flex-wrap gap-2">
          {[null, ...statuses].map((s) => (
            <Link
              key={s ?? "all"}
              href={link({ status: s })}
              prefetch={false}
              aria-current={s === status ? "page" : undefined}
              className={cn(
                "rounded-full border px-4 py-1.5",
                s === status ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary",
              )}
            >
              {s ? BATCH_STATUS_LABEL[s] : "ทุกสถานะ"}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-end gap-2" action="/app/exams/batches">
          {scope !== "all" ? <input type="hidden" name="scope" value={scope} /> : null}
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">รอบสมัครสอบ</span>
            <select name="round" defaultValue={round ?? ""} className={selectClass}>
              <option value="">ทุกรอบ</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {examName(r.exam_type, r.level)} {r.year_be}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="outline">
            แสดง
          </Button>
        </form>
      </div>

      <p className="mt-4" data-testid="batch-totals">
        {n(accounts.length)} บัญชี · ผู้สมัคร {n(totalCandidates)} คน
      </p>

      {accounts.length === 0 ? (
        <p className="mt-3 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="no-batches">
          ยังไม่มีบัญชี{status ? `ในสถานะ ${BATCH_STATUS_LABEL[status]}` : ""}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2" data-testid="batch-list">
          {accounts.map((b) => (
            <li key={b.id}>
              <Link href={`/app/exams/batches/${b.id}`} prefetch={false} className="block rounded-xl border bg-card px-4 py-3 hover:bg-secondary">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {examName(b.exam_type, b.level)} {b.year_be}
                  </span>
                  <span className="text-sm text-muted-foreground">แบบ {b.form_code}</span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-medium", BATCH_STATUS_CLASS[b.status])}>
                    {BATCH_STATUS_LABEL[b.status]}
                  </span>
                  {b.request_no ? <span className="text-sm font-medium">เลขที่รับ {b.request_no}</span> : null}
                  {b.uploaded_by_me ? null : <span className="text-sm text-muted-foreground">(ผู้อื่นอัปโหลด)</span>}
                </span>
                <span className="mt-1 block break-words">
                  {b.place_name} · สนามสอบ {b.venue_name} ({b.venue_code})
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">ผู้สมัคร {n(b.saved_count)} คน</span>
                  {b.error_count ? <span className="text-destructive"> · ไม่ผ่าน {n(b.error_count)} แถว</span> : null}
                  {" · "}
                  {b.unit_name}
                  {b.status === "submitted" && b.current_unit_name ? ` · รอรับรองที่ ${b.current_unit_name}` : ""}
                  {" · "}
                  {b.submitted_at ? `ส่ง ${thaiDateTime(b.submitted_at)}` : `อัปโหลด ${thaiDateTime(b.created_at)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
