import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireWorkspace } from "@/lib/auth/guards";
import { isUuid } from "@/lib/budget";
import { DOC_STATUS_LABEL, docRefLabel } from "@/lib/docs";
import { fetchDocumentDetail } from "@/lib/docs-server";
import { buildTrack } from "@/lib/docs-track";
import { thaiDate, thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { DocBadges } from "../../ui";

export const metadata: Metadata = { title: "ติดตามหนังสือ" };
export const dynamic = "force-dynamic";

const STATE_TEXT = {
  draft: "ร่าง",
  open: "อยู่ระหว่างดำเนินการ",
  closed: "ปิดเรื่องแล้ว",
  cancelled: "ยกเลิกแล้ว",
} as const;

/** ติดตามหนังสือ: เส้นทางเดินเป็นเส้นเวลา ขณะนี้อยู่ที่ใคร ค้างกี่วัน (ฐานข้อมูลกรองเส้นทางตามสิทธิ์) */
export default async function TrackDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireWorkspace();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = await fetchDocumentDetail(id);
  if (!d) notFound();
  const t = buildTrack(d);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p>
        <Link href={`/app/docs/${d.id}`} className="text-primary underline underline-offset-4">
          ← กลับหน้าหนังสือ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ติดตามหนังสือ</h1>
      <p className="mt-1 text-lg" data-testid="track-doc">
        <DocBadges urgency={d.urgency} classification={d.classification} />
        <span className="font-semibold">{d.scope === "owner" ? docRefLabel(d) : d.doc_no ? `ที่ ${d.doc_no}` : ""}</span> {d.subject}
      </p>
      <p className="text-muted-foreground">
        {d.org_unit_name}
        {d.scope === "owner" ? ` · ${DOC_STATUS_LABEL[d.status]}` : ""}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3" data-testid="track-summary">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-sm text-muted-foreground">สถานะ</p>
          <p className="text-lg font-bold" data-testid="track-state">
            {STATE_TEXT[t.state]}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-sm text-muted-foreground">{d.direction === "receive" ? "ลงรับเมื่อ" : "เริ่มเมื่อ"}</p>
          <p className="text-lg font-bold">{thaiDate(t.startedAt, "short")}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-sm text-muted-foreground">{t.state === "open" || t.state === "draft" ? "ผ่านมาแล้ว" : "ใช้เวลารวม"}</p>
          <p className="text-lg font-bold tabular-nums" data-testid="track-total-days">
            {t.totalDays.toLocaleString("th-TH")} วัน
          </p>
        </div>
      </div>

      {t.holders.length ? (
        <section className="mt-6 rounded-xl border-2 border-ring bg-card p-5" data-testid="track-holders">
          <h2 className="text-lg font-bold text-primary">ขณะนี้อยู่ที่</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {t.holders.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" data-testid="track-holder">
                <span className="min-w-0">
                  <span className="font-semibold">{h.who}</span>
                  <span className="block text-sm text-muted-foreground">
                    {h.what} ตั้งแต่ {thaiDateTime(h.since)}
                    {h.dueOn ? ` · กำหนด ${thaiDate(h.dueOn, "short")}` : ""}
                  </span>
                </span>
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-semibold tabular-nums",
                    h.overdue ? "border-destructive text-destructive" : h.days >= 7 ? "border-amber-500 text-amber-800" : "text-foreground",
                  )}
                  data-testid="holder-days"
                >
                  {h.overdue ? "เกินกำหนด · " : ""}ค้าง {h.days.toLocaleString("th-TH")} วัน
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border bg-card p-5">
        <h2 className="text-lg font-bold text-primary">เส้นทางเดินของหนังสือ</h2>
        <ol className="mt-4 flex flex-col" data-testid="track-events">
          {t.events.map((e, i) => (
            <li key={i} className="relative flex gap-3 pb-5 last:pb-0" data-testid="track-event">
              <span aria-hidden className="relative flex w-4 shrink-0 justify-center">
                <span
                  className={cn(
                    "z-10 mt-1.5 size-3 rounded-full border-2",
                    e.tone === "done" ? "border-emerald-700 bg-emerald-700" : e.tone === "warn" ? "border-amber-600 bg-amber-100" : e.tone === "muted" ? "border-muted-foreground bg-card" : "border-primary bg-card",
                  )}
                />
                {i < t.events.length - 1 ? <span className="absolute top-3 bottom-[-0.375rem] w-0.5 bg-border" /> : null}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{thaiDateTime(e.at)}</p>
                <p className={cn("font-semibold", e.tone === "muted" && "text-muted-foreground line-through")}>{e.title}</p>
                {e.detail ? <p className="break-words whitespace-pre-wrap">{e.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
        {d.scope === "recipient" ? (
          <p className="mt-4 text-sm text-muted-foreground">หน่วยของท่านเห็นเฉพาะเส้นทางที่ส่งถึงหน่วยของท่าน</p>
        ) : null}
      </section>
    </section>
  );
}
