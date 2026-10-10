import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireMenu } from "@/lib/auth/guards";
import { examName } from "@/lib/exam-forms";
import {
  RESULT_CLASS,
  RESULT_LABEL,
  RESULT_STATUS_LABEL,
  RESULTS,
  SUBJECTS,
  isResultCode,
  type ResultHistoryItem,
} from "@/lib/exam-results";
import { fetchPassListOptions, fetchResultHistory, fetchResultRounds, fetchResultRows, isUuid } from "@/lib/exam-results-server";
import { thaiDate, thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";
import { todayInBangkok } from "@/lib/venues";

import { confirmResultImport, previewResultImport } from "../actions";
import { ResultsImportButton } from "../import-button";
import { PublishForm } from "./publish-form";

export const metadata: Metadata = { title: "ผลสอบของรอบ" };
export const dynamic = "force-dynamic";

const n = (v: number) => v.toLocaleString("th-TH");
const PAGE = 200;
const selectClass = "h-11 rounded-md border border-input bg-background px-3 text-base";

function historyText(h: ResultHistoryItem): string {
  if (h.action === "import") {
    const a = (h.after_data ?? {}) as { new?: number; updated?: number };
    return `นำเข้าจาก Excel: เพิ่มใหม่ ${n(a.new ?? 0)} คน แก้ผลเดิม ${n(a.updated ?? 0)} คน`;
  }
  if (h.action === "publish") {
    const a = (h.after_data ?? {}) as { announced_on?: string; results?: number; missing?: number };
    return `ประกาศผล ${n(a.results ?? 0)} คน วันที่ประกาศ ${thaiDate(a.announced_on ?? null)}${a.missing ? ` (ยังไม่มีผล ${n(a.missing)} คน)` : ""}`;
  }
  const after = (h.after_data ?? {}) as { result?: string };
  const before = h.before_data?.result ? RESULT_LABEL[h.before_data.result] : "ยังไม่มีผล";
  return `แก้ผล ${h.candidate_code ?? ""} ${h.full_name ?? ""}: ${before} > ${isResultCode(after.result) ? RESULT_LABEL[after.result] : "-"}`;
}

export default async function ResultRoundPage({
  params,
  searchParams,
}: {
  params: Promise<{ round: string }>;
  searchParams: Promise<{ result?: string; q?: string; page?: string; saved?: string }>;
}) {
  const ctx = await requireMenu("/app/exams");
  if (!ctx.canManageExamRounds) redirect("/app/exams/results/lists");
  const { round: roundId } = await params;
  if (!isUuid(roundId)) notFound();
  const round = (await fetchResultRounds()).find((r) => r.id === roundId);
  if (!round) notFound();

  const sp = await searchParams;
  const filter = sp.result === "missing" || isResultCode(sp.result) ? sp.result : null;
  const q = (sp.q ?? "").slice(0, 100);
  const page = Math.max(1, Number(sp.page) || 1);
  const [rows, history, options] = await Promise.all([
    fetchResultRows(roundId, { result: filter, q, limit: PAGE, offset: (page - 1) * PAGE }),
    fetchResultHistory(roundId),
    fetchPassListOptions(roundId, null),
  ]);
  const venues = options.filter((o) => o.kind === "venue");
  const total = rows[0]?.total ?? 0;
  const missing = round.candidates - round.results;
  const published = round.result_status === "published";
  const link = (next: { result?: string | null; page?: number }) => {
    const u = new URLSearchParams();
    const r = next.result === undefined ? filter : next.result;
    if (r) u.set("result", r);
    if (q) u.set("q", q);
    if (next.page && next.page > 1) u.set("page", String(next.page));
    const s = u.toString();
    return `/app/exams/results/${roundId}${s ? `?${s}` : ""}`;
  };
  const tiles: { label: string; value: number; key: string | null }[] = [
    { label: "ผู้สมัคร (ส่งสอบ)", value: round.candidates, key: null },
    { label: "สอบได้", value: round.passed, key: "passed" },
    { label: "สอบตก", value: round.failed, key: "failed" },
    { label: "ขาดสอบ", value: round.absent, key: "absent" },
    { label: "ยังไม่มีผล", value: missing, key: "missing" },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams" className="text-primary underline underline-offset-4">
          สมัครสอบและผลสอบ
        </Link>{" "}
        /{" "}
        <Link href="/app/exams/results" className="text-primary underline underline-offset-4">
          ผลสอบ
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">
          ผลสอบ{examName(round.exam_type, round.level)} ปีการศึกษา {round.year_be}
        </h1>
        <span
          className={cn("rounded-full px-3 py-1 text-sm font-medium", published ? "bg-green-100 text-green-900" : "bg-muted")}
          data-testid="result-status"
        >
          {RESULT_STATUS_LABEL[round.result_status]}
          {round.results_announced_on ? ` · ประกาศ ${thaiDate(round.results_announced_on)}` : ""}
        </span>
      </div>
      {sp.saved ? (
        <p role="status" className="mt-3 rounded-md border bg-secondary px-3 py-2 font-medium text-primary">
          {sp.saved.slice(0, 200)}
        </p>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-5" data-testid="result-tiles">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={link({ result: t.key, page: 1 })}
            prefetch={false}
            className={cn("rounded-xl border bg-card p-4 hover:bg-secondary", filter === t.key && "ring-2 ring-primary")}
          >
            <span className="block text-sm text-muted-foreground">{t.label}</span>
            <span className="text-2xl font-bold">{n(t.value)}</span>
          </Link>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 className="text-xl font-bold text-primary">นำเข้าผลสอบ</h2>
        {published ? (
          <p className="text-muted-foreground">รอบนี้ประกาศผลแล้ว นำเข้าจาก Excel ไม่ได้ แก้ผลรายคนได้ที่ตารางด้านล่าง (ต้องระบุเหตุผล)</p>
        ) : (
          <>
            <p className="text-muted-foreground">
              ดาวน์โหลดแม่แบบ (มีรหัสผู้สมัคร ชื่อ สำนัก สนามสอบ เติมไว้แล้ว) กรอกผลสอบ สอบได้ / สอบตก / ขาดสอบ คะแนนรายวิชา (ถ้ามี) และเลขที่ ปกศ.
              ของผู้สอบได้ แล้วนำเข้า แถวที่ยังไม่กรอกผลจะถูกข้าม นำเข้าซ้ำได้ (แก้ผลเดิม) จนกว่าจะประกาศผล
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline">
                <a href={`/app/exams/results/${roundId}/template`} download>
                  <Download aria-hidden />
                  ดาวน์โหลดแม่แบบผลสอบ
                </a>
              </Button>
              <ResultsImportButton
                label="นำเข้าผลสอบจาก Excel"
                title={`นำเข้าผลสอบ${examName(round.exam_type, round.level)} ${round.year_be}`}
                columns={["รหัสผู้สมัคร", "ชื่อ", "สำนัก", "ผลสอบ", "เลขที่ ปกศ."]}
                itemUnit="คน"
                preview={previewResultImport.bind(null, roundId)}
                confirm={confirmResultImport.bind(null, roundId)}
              />
            </div>
            {venues.length > 1 ? (
              <form action={`/app/exams/results/${roundId}/template`} className="flex flex-wrap items-end gap-2" data-testid="template-venue">
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-muted-foreground">หรือแม่แบบเฉพาะสนามสอบ (ไฟล์เล็กลง นำเข้าได้ครั้งละไม่เกิน 5,000 แถว)</span>
                  <select name="venue" className={selectClass} defaultValue={venues[0]?.id}>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.code} {v.name} ({n(v.candidates)} คน)
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="outline">
                  ดาวน์โหลด
                </Button>
              </form>
            ) : null}
            <PublishForm roundId={roundId} missing={missing} today={todayInBangkok()} />
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-bold text-primary">ผู้สมัครและผลสอบ</h2>
        <form className="flex flex-wrap items-end gap-2" action={`/app/exams/results/${roundId}`}>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">ผลสอบ</span>
            <select name="result" defaultValue={filter ?? ""} className={selectClass}>
              <option value="">ทั้งหมด</option>
              {RESULTS.map((r) => (
                <option key={r} value={r}>
                  {RESULT_LABEL[r]}
                </option>
              ))}
              <option value="missing">ยังไม่มีผล</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">รหัสหรือชื่อ</span>
            <input name="q" defaultValue={q} maxLength={100} className={selectClass} />
          </label>
          <Button type="submit" variant="outline">
            แสดง
          </Button>
        </form>
      </div>
      <p className="mt-2 text-sm text-muted-foreground" data-testid="result-total">
        {n(total)} คน{total > PAGE ? ` · หน้า ${n(page)} จาก ${n(Math.ceil(total / PAGE))}` : ""}
      </p>
      <div className="mt-2 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[60rem] border-collapse text-left text-sm" data-testid="result-rows">
          <thead className="bg-secondary">
            <tr>
              <th scope="col" className="px-3 py-2">รหัสผู้สมัคร</th>
              <th scope="col" className="px-3 py-2">ชื่อ</th>
              <th scope="col" className="px-3 py-2">สำนัก / สนามสอบ</th>
              <th scope="col" className="px-3 py-2">ผล</th>
              {SUBJECTS.map((s) => (
                <th key={s.key} scope="col" className="px-3 py-2 text-right">
                  {s.label}
                </th>
              ))}
              <th scope="col" className="px-3 py-2">เลขที่ ปกศ.</th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">แก้ไข</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6 + SUBJECTS.length} className="px-3 py-6 text-center text-muted-foreground">
                  ไม่มีรายการตามเงื่อนไขนี้
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.candidate_id} className="border-t align-top" data-testid="result-row" data-code={r.candidate_code}>
                  <td className="px-3 py-2 font-mono">{r.candidate_code}</td>
                  <td className="px-3 py-2">
                    {[r.title, r.first_name, r.monastic_name, r.last_name].filter(Boolean).join(" ")}
                    {r.stage ? <span className="block text-muted-foreground">{r.stage}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    {r.place_name}
                    <span className="block text-muted-foreground">
                      {r.venue_code} {r.venue_name}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.result ? (
                      <span className={cn("rounded-full px-2.5 py-0.5 font-medium", RESULT_CLASS[r.result])}>{RESULT_LABEL[r.result]}</span>
                    ) : (
                      <span className="text-muted-foreground">ยังไม่มีผล</span>
                    )}
                  </td>
                  {SUBJECTS.map((s) => (
                    <td key={s.key} className="px-3 py-2 text-right tabular-nums">
                      {r.scores?.[s.key] ?? ""}
                    </td>
                  ))}
                  <td className="px-3 py-2">{r.certificate_no || ""}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/app/exams/results/${roundId}/candidates/${r.candidate_id}`}
                      prefetch={false}
                      className="text-primary underline underline-offset-4"
                    >
                      {r.result ? "แก้ผล" : "บันทึกผล"}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {total > PAGE ? (
        <nav aria-label="หน้า" className="mt-3 flex gap-2">
          {page > 1 ? (
            <Link href={link({ page: page - 1 })} prefetch={false} className="rounded-md border bg-card px-4 py-2">
              ก่อนหน้า
            </Link>
          ) : null}
          {page * PAGE < total ? (
            <Link href={link({ page: page + 1 })} prefetch={false} className="rounded-md border bg-card px-4 py-2">
              ถัดไป
            </Link>
          ) : null}
        </nav>
      ) : null}

      <h2 className="mt-8 text-xl font-bold text-primary">ประวัติผลสอบของรอบ</h2>
      {history.length === 0 ? (
        <p className="mt-2 text-muted-foreground">ยังไม่มีประวัติ</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2" data-testid="result-history">
          {history.map((h, i) => (
            <li key={i} className="rounded-lg border bg-card px-4 py-2">
              <span className="font-medium">{historyText(h)}</span>
              {h.reason ? <span className="block">เหตุผล: {h.reason}</span> : null}
              <span className="block text-sm text-muted-foreground">
                {thaiDateTime(h.created_at)} · {h.actor_name ?? "ระบบ"}
                {h.after_publish ? " · แก้หลังประกาศผล" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
