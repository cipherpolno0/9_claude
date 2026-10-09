import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";

import { requireMenu } from "@/lib/auth/guards";
import { BATCH_STATUS_CLASS, BATCH_STATUS_LABEL, BATCH_STATUSES, isBatchStatus } from "@/lib/exam-batches";
import { fetchBatches } from "@/lib/exam-batches-server";
import { examName } from "@/lib/exam-forms";
import { thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "ชุดรายชื่อผู้สมัครสอบ" };
export const dynamic = "force-dynamic";

export default async function BatchesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireMenu("/app/exams");
  const { status: rawStatus } = await searchParams;
  const status = isBatchStatus(rawStatus) ? rawStatus : null;
  const batches = await fetchBatches(status);

  const tabs = [{ value: null, label: "ทั้งหมด" }, ...BATCH_STATUSES.map((s) => ({ value: s, label: BATCH_STATUS_LABEL[s] }))];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams" className="text-primary underline underline-offset-4">
          สมัครสอบและผลสอบ
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">ชุดรายชื่อผู้สมัครสอบ</h1>
          <p className="mt-1 text-muted-foreground">
            ไฟล์บัญชี ศ. ที่อัปโหลดแล้ว ท่านเห็นชุดที่ท่านอัปโหลด เจ้าคณะและเลขานุการเห็นชุดในเขตของตน
          </p>
        </div>
        <Link
          href="/app/exams/batches/new"
          prefetch={false}
          className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Upload className="size-5" aria-hidden />
          อัปโหลดไฟล์ใหม่
        </Link>
      </div>

      <nav aria-label="กรองตามสถานะ" className="mt-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.value ? `/app/exams/batches?status=${t.value}` : "/app/exams/batches"}
            prefetch={false}
            aria-current={t.value === status ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-1.5",
              t.value === status ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {batches.length === 0 ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="no-batches">
          ยังไม่มีชุดรายชื่อ{status ? `ในสถานะ ${BATCH_STATUS_LABEL[status]}` : ""}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2" data-testid="batch-list">
          {batches.map((b) => (
            <li key={b.id}>
              <Link
                href={`/app/exams/batches/${b.id}`}
                prefetch={false}
                className="block rounded-xl border bg-card px-4 py-3 hover:bg-secondary"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {examName(b.exam_type, b.level)} {b.year_be}
                  </span>
                  <span className="text-sm text-muted-foreground">แบบ {b.form_code}</span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-medium", BATCH_STATUS_CLASS[b.status])}>
                    {BATCH_STATUS_LABEL[b.status]}
                  </span>
                  {b.uploaded_by_me ? null : <span className="text-sm text-muted-foreground">(ผู้อื่นอัปโหลด)</span>}
                </span>
                <span className="mt-1 block break-words">
                  {b.place_name} · สนามสอบ {b.venue_name} ({b.venue_code})
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {b.row_count.toLocaleString("th-TH")} แถว · ผ่าน {b.ok_count.toLocaleString("th-TH")}
                  {b.error_count ? (
                    <span className="font-semibold text-destructive"> · ไม่ผ่าน {b.error_count.toLocaleString("th-TH")}</span>
                  ) : null}
                  {b.status === "confirmed" || b.status === "submitted"
                    ? ` · บันทึกแล้ว ${b.saved_count.toLocaleString("th-TH")} คน`
                    : ""}{" "}
                  · อัปโหลด {thaiDateTime(b.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
