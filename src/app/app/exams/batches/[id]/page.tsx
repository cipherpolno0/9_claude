import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileSpreadsheet } from "lucide-react";

import { requireMenu } from "@/lib/auth/guards";
import {
  BATCH_PAGE_SIZE,
  BATCH_STATUS_CLASS,
  BATCH_STATUS_LABEL,
  CANDIDATE_STATUS_LABEL,
  candidateName,
  maskedId,
  type CandidateRow,
} from "@/lib/exam-batches";
import { fetchBatch, fetchCandidates, type CandidateFilter } from "@/lib/exam-batches-server";
import { examName, type FormColumn } from "@/lib/exam-forms";
import { thaiDate, thaiDateTime, toBuddhistDateText } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { BatchActions } from "./batch-actions";

export const metadata: Metadata = { title: "ตรวจรายชื่อผู้สมัครสอบ" };
export const dynamic = "force-dynamic";

/** ค่าของคอลัมน์ตามแบบ ศ. สำหรับแสดง (เลขประจำตัวปิดไว้ เหลือ 4 ตัวท้าย วันที่เป็น พ.ศ.) */
function columnValue(c: CandidateRow, col: FormColumn): string {
  switch (col.key) {
    case "seq":
      return c.seq === null ? "" : String(c.seq);
    case "national_id":
      return c.national_id_last4 ? maskedId(c) : "";
    case "title":
    case "first_name":
    case "monastic_name":
    case "last_name":
    case "stage":
      return c[col.key];
    case "birth_date":
    case "ordination_date":
      return toBuddhistDateText(c[col.key]);
    default:
      return c.extra?.[col.key] ?? "";
  }
}

export default async function BatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ show?: string; page?: string }>;
}) {
  await requireMenu("/app/exams");
  const { id } = await params;
  const sp = await searchParams;
  const batch = await fetchBatch(id);
  if (!batch) notFound();

  const filter: CandidateFilter = sp.show === "error" || sp.show === "ok" ? sp.show : "all";
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const { rows, total } = await fetchCandidates(batch.id, filter, page);
  const pages = Math.max(1, Math.ceil(total / BATCH_PAGE_SIZE));
  const monastic = batch.round.exam_type === "nak_tham";
  const columns = batch.template.columns;
  const errorRows = batch.error_count;
  const href = (show: CandidateFilter, p = 1) =>
    `/app/exams/batches/${batch.id}?${new URLSearchParams({ ...(show !== "all" ? { show } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  const n = (v: number) => v.toLocaleString("th-TH");
  const saved = batch.status === "confirmed" || batch.status === "submitted";

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/exams" className="text-primary underline underline-offset-4">
          สมัครสอบและผลสอบ
        </Link>{" "}
        /{" "}
        <Link href="/app/exams/batches" className="text-primary underline underline-offset-4">
          ชุดรายชื่อผู้สมัครสอบ
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">
          {examName(batch.round.exam_type, batch.round.level)} {batch.round.year_be}
        </h1>
        <span className={cn("rounded-full px-3 py-1 font-medium", BATCH_STATUS_CLASS[batch.status])} data-testid="batch-status">
          {BATCH_STATUS_LABEL[batch.status]}
        </span>
      </div>
      <p className="mt-1 break-words text-lg">{batch.place.name}</p>

      <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-xl border bg-card p-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">แบบ</dt>
          <dd>บัญชี {batch.template.code}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">สนามสอบ</dt>
          <dd className="break-words">
            {batch.venue.name} (รหัส {batch.venue.code})
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">ไฟล์ต้นฉบับ</dt>
          <dd className="break-words">
            {batch.has_file ? (
              <a href={`/app/exams/batches/${batch.id}/file`} className="text-primary underline underline-offset-4">
                <FileSpreadsheet className="mr-1 inline size-4" aria-hidden />
                {batch.file_name}
              </a>
            ) : (
              batch.file_name || "-"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">ผู้อัปโหลด</dt>
          <dd>
            {batch.uploader_name} · {thaiDateTime(batch.created_at)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">วันสอบวันแรก (ใช้คิดอายุและพรรษา)</dt>
          <dd>{thaiDate(batch.round.exam_starts_on)}</dd>
        </div>
        {batch.confirmed_at ? (
          <div>
            <dt className="text-sm text-muted-foreground">ยืนยันเมื่อ</dt>
            <dd>{thaiDateTime(batch.confirmed_at)}</dd>
          </div>
        ) : null}
        {batch.withdrawn_at ? (
          <div>
            <dt className="text-sm text-muted-foreground">ถอนเมื่อ</dt>
            <dd>
              {thaiDateTime(batch.withdrawn_at)}
              {batch.withdraw_reason ? ` · ${batch.withdraw_reason}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>

      <h2 className="mt-6 text-xl font-bold text-primary">ขั้น ค. ผลการตรวจ</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="batch-summary">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">แถวในไฟล์</p>
          <p className="text-2xl font-bold">{n(batch.row_count)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">ผ่าน</p>
          <p className="text-2xl font-bold text-green-800" data-testid="ok-count">
            {n(batch.ok_count)}
          </p>
        </div>
        <div className={cn("rounded-xl border p-4", errorRows ? "border-destructive bg-destructive/5" : "bg-card")}>
          <p className="text-sm text-muted-foreground">ไม่ผ่าน</p>
          <p className={cn("text-2xl font-bold", errorRows ? "text-destructive" : "")} data-testid="error-count">
            {n(errorRows)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">บันทึกเป็นผู้สมัคร</p>
          <p className="text-2xl font-bold">{saved ? n(batch.saved_count) : "-"}</p>
        </div>
      </div>

      {errorRows ? (
        <p className="mt-3">
          <a
            href={`/app/exams/batches/${batch.id}/errors`}
            className="inline-flex h-11 items-center gap-2 rounded-md border bg-background px-4 font-medium hover:bg-secondary"
            data-testid="error-download"
          >
            <Download className="size-5" aria-hidden />
            ดาวน์โหลดรายการข้อผิดพลาด (Excel)
          </a>
        </p>
      ) : null}

      {batch.can_act && batch.status !== "submitted" ? (
        <div className="mt-4">
          <BatchActions batch={batch} />
        </div>
      ) : null}

      <nav aria-label="กรองแถว" className="mt-6 flex flex-wrap gap-2">
        {(
          [
            ["all", `ทุกแถว (${n(batch.row_count)})`],
            ["error", `ไม่ผ่าน (${n(errorRows)})`],
            ["ok", `ผ่าน (${n(batch.ok_count)})`],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={href(key)}
            prefetch={false}
            aria-current={filter === key ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-1.5",
              filter === key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-3 overflow-x-auto rounded-xl border bg-card" data-testid="candidate-table-wrap">
        <table className="w-full min-w-[56rem] border-collapse text-left">
          <thead className="bg-secondary text-sm">
            <tr>
              <th scope="col" className="whitespace-nowrap px-3 py-2">แถว</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2">เลขที่</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2">ชื่อ</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2">เลขประจำตัว</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2">อายุ</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2">{monastic ? "พรรษา" : "ช่วงชั้น"}</th>
              <th scope="col" className="whitespace-nowrap px-3 py-2">{monastic ? "วัด" : "สถานศึกษา/องค์กร"}</th>
              {saved ? <th scope="col" className="whitespace-nowrap px-3 py-2">รหัสผู้สมัคร</th> : null}
              <th scope="col" className="whitespace-nowrap px-3 py-2">ผลการตรวจ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  ไม่มีแถว
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const bad = c.status !== "ok";
                const badFields = new Set(c.errors.map((e) => e.field));
                return (
                  <tr
                    key={c.id}
                    className={cn("border-t align-top", bad && "bg-destructive/10")}
                    data-testid="candidate-row"
                    data-status={c.status}
                  >
                    <td className="px-3 py-2">{c.row_no}</td>
                    <td className="px-3 py-2">{c.seq ?? "-"}</td>
                    <td className="min-w-48 px-3 py-2">
                      <span className="font-medium">{candidateName(c) || "-"}</span>
                      <details className="mt-1 text-sm">
                        <summary className="cursor-pointer text-primary">ข้อมูลทุกช่อง</summary>
                        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                          {columns.map((col) => (
                            <div key={col.key} className="contents">
                              <dt className={cn("text-muted-foreground", badFields.has(col.key) && "font-semibold text-destructive")}>
                                {col.label}
                              </dt>
                              <dd className={cn("break-words", badFields.has(col.key) && "font-semibold text-destructive")}>
                                {columnValue(c, col) || "-"}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{maskedId(c)}</td>
                    <td className="px-3 py-2">{c.age ?? "-"}</td>
                    <td className="px-3 py-2">{monastic ? (c.phansa ?? "-") : c.stage || "-"}</td>
                    <td className="min-w-32 px-3 py-2 break-words">{c.school_name || "-"}</td>
                    {saved ? <td className="px-3 py-2 whitespace-nowrap font-medium">{c.candidate_code ?? "-"}</td> : null}
                    <td className="px-3 py-2">
                      {bad ? (
                        <>
                          <span className="font-semibold text-destructive">{CANDIDATE_STATUS_LABEL[c.status]}</span>
                          <ul className="mt-1 list-disc pl-5 text-sm text-destructive" data-testid="row-errors">
                            {c.errors.map((e, i) => (
                              <li key={i}>
                                <strong>{e.label}</strong>: {e.message}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <span className="font-semibold text-green-800">ผ่าน</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <nav aria-label="เลือกหน้า" className="mt-3 flex flex-wrap items-center gap-2">
          {page > 1 ? (
            <Link href={href(filter, page - 1)} prefetch={false} className="rounded-md border bg-card px-3 py-1.5 hover:bg-secondary">
              หน้าก่อน
            </Link>
          ) : null}
          <span>
            หน้า {page} จาก {pages} ({n(total)} แถว)
          </span>
          {page < pages ? (
            <Link href={href(filter, page + 1)} prefetch={false} className="rounded-md border bg-card px-3 py-1.5 hover:bg-secondary">
              หน้าถัดไป
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
