import type { Metadata } from "next";
import Link from "next/link";

import { requireWorkspace } from "@/lib/auth/guards";
import { ROUTE_STATUS_LABEL, type TaskRow } from "@/lib/docs";
import { fetchDocsCounts, fetchTasks, remindDocsDue } from "@/lib/docs-server";
import { thaiDate, thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { RouteDoneForm } from "../route-forms";
import { DocBadges, DocsNav } from "../ui";

export const metadata: Metadata = { title: "งานของฉัน" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : (v ?? ""));

function Due({ t }: { t: TaskRow }) {
  if (!t.due_on) return <span className="text-muted-foreground">ไม่กำหนด</span>;
  return (
    <span className={cn(t.overdue && "font-bold text-destructive")} data-testid={t.overdue ? "overdue" : undefined}>
      {thaiDate(t.due_on, "short")}
      {t.overdue ? " (เกินกำหนด)" : ""}
    </span>
  );
}

function Status({ t }: { t: TaskRow }) {
  const open = t.status === "pending" || t.status === "read";
  return (
    <span className={cn("font-semibold", open ? "text-amber-800" : "text-emerald-800")}>
      {open ? "รอดำเนินการ" : ROUTE_STATUS_LABEL[t.status]}
      {t.done_at ? <span className="block text-sm font-normal text-muted-foreground">{thaiDateTime(t.done_at)}</span> : null}
    </span>
  );
}

/** งานที่ได้รับมอบหมายจากหนังสือ (รายงานผล) และงานที่ฉันมอบหมาย (ติดตาม) */
export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireWorkspace();
  const tab = one((await searchParams).tab) === "ordered" ? "ordered" : "mine";
  await remindDocsDue();
  const [rows, counts] = await Promise.all([fetchTasks(tab), fetchDocsCounts()]);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">งานของฉัน</h1>
      <DocsNav current="tasks" counts={counts} showRegister={ctx.canViewDocs} />
      <nav aria-label="กลุ่มงาน" className="mt-6 flex flex-wrap gap-1 border-b" data-testid="task-tabs">
        {(
          [
            ["mine", "ได้รับมอบหมาย"],
            ["ordered", "ที่ฉันมอบหมาย"],
          ] as const
        ).map(([k, label]) => (
          <Link
            key={k}
            href={`/app/docs/tasks?tab=${k}`}
            aria-current={k === tab ? "page" : undefined}
            className={cn("rounded-t-md border border-b-0 px-4 py-2 font-semibold", k === tab ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-4 text-muted-foreground" data-testid="tasks-empty">
          {tab === "mine" ? "ยังไม่มีงานที่ได้รับมอบหมาย" : "ท่านยังไม่ได้มอบหมายงาน"}
        </p>
      ) : tab === "mine" ? (
        <ul className="mt-4 flex flex-col gap-4">
          {rows.map((t) => {
            const open = t.status === "pending" || t.status === "read";
            return (
              <li key={t.route_id} className="rounded-xl border bg-card p-4" data-testid="task-item">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold">
                    <DocBadges urgency={t.urgency} classification={t.classification} />
                    <Link href={`/app/docs/${t.document_id}`} className="text-primary underline underline-offset-4">
                      {t.doc_no ? `ที่ ${t.doc_no} ` : ""}
                      {t.subject}
                    </Link>
                  </p>
                  <Status t={t} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t.org_unit_name} · มอบหมายโดย {t.from_name ?? "-"} เมื่อ {thaiDateTime(t.sent_at)}
                </p>
                <p className="mt-1">คำสั่งการ: {t.message}</p>
                <p className="mt-1">
                  กำหนดเสร็จ: <Due t={t} />
                </p>
                {open ? (
                  <div className="mt-3 border-t pt-3">
                    <RouteDoneForm routeId={t.route_id} action="act" unitId={t.org_unit_id} currentUserId={ctx.user.id} />
                  </div>
                ) : t.done_note ? (
                  <p className="mt-2 rounded-md bg-secondary px-3 py-2">ผลการดำเนินการ: {t.done_note}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="mt-4 flex flex-col gap-3" data-testid="ordered-list">
          {rows.map((t) => (
            <li key={t.route_id} className="grid gap-1 rounded-xl border bg-card p-4 md:grid-cols-[2fr_1fr_1fr_1fr]" data-testid="ordered-item">
              <div>
                <Link href={`/app/docs/${t.document_id}`} className="font-semibold text-primary underline underline-offset-4">
                  {t.doc_no ? `ที่ ${t.doc_no} ` : ""}
                  {t.subject}
                </Link>
                <p className="text-sm text-muted-foreground">คำสั่งการ: {t.message}</p>
                {t.done_note ? (
                  <p className="text-sm">
                    ผล: {t.done_note}
                    {t.attachment_count ? ` (ไฟล์ ${t.attachment_count})` : ""}
                  </p>
                ) : null}
              </div>
              <p>
                <span className="text-sm text-muted-foreground md:hidden">ผู้ดำเนินการ: </span>
                {t.to_name}
              </p>
              <p>
                <span className="text-sm text-muted-foreground md:hidden">กำหนดเสร็จ: </span>
                <Due t={t} />
              </p>
              <Status t={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
