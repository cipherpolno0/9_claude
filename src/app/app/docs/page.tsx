import type { Metadata } from "next";
import Link from "next/link";
import { Paperclip, Plus, Settings } from "lucide-react";

import { DataTable, type DataTableColumn, type DataTableRow } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { parseTableParams } from "@/lib/data-table";
import {
  currentYearBe,
  DOC_KIND_LABEL,
  DOC_KINDS,
  DOC_STATUS_LABEL,
  DOC_TAB_LABEL,
  DOC_TABS,
  DOC_URGENCIES,
  DOC_URGENCY_LABEL,
  isDocTab,
  type DocRow,
  type DocTab,
} from "@/lib/docs";
import { fetchDocsCounts, fetchDocumentYears, fetchIncoming, queryDocuments } from "@/lib/docs-server";
import { findWorkspaceMenu } from "@/lib/site";
import { thaiDate, thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { docsQuery, loadDocsScope } from "./scope";
import { DocBadges, DocsNav, DocsNoAccess, DocsUnitSelect } from "./ui";

const menu = findWorkspaceMenu("/app/docs");

export const metadata: Metadata = { title: menu.title };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : (v ?? ""));

const COLUMNS: Record<DocTab, DataTableColumn[]> = {
  receive: [
    { key: "no", header: "เลขรับ", sortable: true, className: "w-20" },
    { key: "docno", header: "ที่" },
    { key: "date", header: "ลงวันที่", sortable: true },
    { key: "from", header: "จาก" },
    { key: "subject", header: "เรื่อง", sortable: true },
    { key: "received", header: "วันเวลารับ" },
    { key: "status", header: "สถานะ" },
  ],
  send: [
    { key: "no", header: "เลขที่", sortable: true },
    { key: "date", header: "ลงวันที่", sortable: true },
    { key: "to", header: "ถึง" },
    { key: "subject", header: "เรื่อง", sortable: true },
    { key: "kind", header: "ชนิด" },
    { key: "status", header: "สถานะ" },
  ],
  draft: [
    { key: "subject", header: "เรื่อง", sortable: true },
    { key: "kind", header: "ชนิด" },
    { key: "to", header: "ถึง" },
    { key: "updated", header: "แก้ไขล่าสุด" },
  ],
};

function SubjectCell({ r }: { r: DocRow }) {
  if (r.masked) {
    return (
      <div key="subject" className="text-muted-foreground" data-testid="masked-row">
        <DocBadges urgency={r.urgency} classification={r.classification} />
        (หนังสือลับ เห็นเฉพาะผู้ที่ระบุชื่อ)
      </div>
    );
  }
  return (
    <div key="subject">
      <DocBadges urgency={r.urgency} classification={r.classification} />
      <Link href={`/app/docs/${r.id}`} prefetch={false} className="text-primary underline underline-offset-4">
        {r.subject}
      </Link>
      {r.attachment_count > 0 ? (
        <span className="ml-1 inline-flex items-center text-sm text-muted-foreground" title="ไฟล์แนบ">
          <Paperclip className="size-4" aria-hidden />
          {r.attachment_count}
        </span>
      ) : null}
      {r.is_copy ? <span className="block text-sm text-muted-foreground">ส่งผ่านระบบ</span> : null}
    </div>
  );
}

function StatusCell({ r }: { r: DocRow }) {
  return (
    <div key="status" className={cn("whitespace-nowrap", r.status === "cancelled" && "text-destructive")}>
      {DOC_STATUS_LABEL[r.status]}
      {r.delivery_total > 0 ? (
        <span className="block text-sm text-muted-foreground">
          ลงรับ {r.delivery_received}/{r.delivery_total} หน่วย
        </span>
      ) : null}
    </div>
  );
}

function cellsOf(tab: DocTab, r: DocRow): React.ReactNode[] {
  if (tab === "receive") {
    return [
      <span key="no" className="font-semibold tabular-nums">
        {r.seq_no}
      </span>,
      r.doc_no || "-",
      thaiDate(r.doc_date, "short"),
      r.masked ? "-" : r.from_text,
      <SubjectCell key="subject" r={r} />,
      <span key="received" className="whitespace-nowrap">
        {thaiDateTime(r.received_at)}
      </span>,
      <StatusCell key="status" r={r} />,
    ];
  }
  if (tab === "send") {
    return [
      <span key="no" className={cn("font-semibold whitespace-nowrap", r.status === "cancelled" && "line-through")}>
        {r.doc_no}
      </span>,
      thaiDate(r.doc_date, "short"),
      r.masked ? "-" : r.to_text || "-",
      <SubjectCell key="subject" r={r} />,
      DOC_KIND_LABEL[r.kind],
      <StatusCell key="status" r={r} />,
    ];
  }
  return [<SubjectCell key="subject" r={r} />, DOC_KIND_LABEL[r.kind], r.masked ? "-" : r.to_text || "-", thaiDateTime(r.updated_at)];
}

/** สารบรรณ: ทะเบียนหนังสือรับ หนังสือส่ง และร่าง ของหน่วย */
export default async function DocsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { ctx, units, unit } = await loadDocsScope(search);
  const tab: DocTab = isDocTab(one(search.tab)) ? (one(search.tab) as DocTab) : "receive";

  if (!ctx.canViewDocs || !unit) {
    return (
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
        {!ctx.isAdmin ? <DocsNav current="register" counts={await fetchDocsCounts()} showRegister={false} /> : null}
        <DocsNoAccess isAdmin={ctx.isAdmin} />
      </section>
    );
  }

  const years = await fetchDocumentYears(unit.id);
  const wantYear = Number(one(search.year));
  const year = years.includes(wantYear) ? wantYear : currentYearBe();
  const params = parseTableParams(search, {
    sortable: ["no", "date", "subject"],
    defaultSort: "no",
    defaultDir: "desc",
    filters: ["kind", "urgency", "status"],
    pageSize: 20,
  });
  const [table, incoming, counts] = await Promise.all([
    queryDocuments(unit.id, tab, year, params),
    tab === "receive" ? fetchIncoming(unit.id) : Promise.resolve([]),
    fetchDocsCounts(),
  ]);
  const rows: DataTableRow[] = table.rows.map((r) => ({ id: r.id, cells: cellsOf(tab, r) }));
  const statusOptions =
    tab === "receive"
      ? (["received", "cancelled"] as const)
      : tab === "send"
        ? (["issued", "sent", "cancelled"] as const)
        : ([] as const);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
          <p className="mt-1 text-muted-foreground" data-testid="docs-unit">
            {unit.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unit.can_edit ? (
            <>
              <Button asChild>
                <Link href={`/app/docs/receive/new?${docsQuery(unit.id)}`}>
                  <Plus aria-hidden />
                  ลงทะเบียนหนังสือรับ
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/app/docs/new?${docsQuery(unit.id)}`}>
                  <Plus aria-hidden />
                  ร่างหนังสือส่ง
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/app/docs/settings?${docsQuery(unit.id)}`}>
                  <Settings aria-hidden />
                  ตั้งค่าหัวหนังสือ
                </Link>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <DocsNav current="register" counts={counts} />
      <DocsUnitSelect units={units} value={unit.id} action="/app/docs" extra={{ tab }} />

      <nav aria-label="ทะเบียน" className="mt-6 flex flex-wrap gap-1 border-b" data-testid="docs-tabs">
        {DOC_TABS.map((t) => (
          <Link
            key={t}
            href={`/app/docs?${docsQuery(unit.id, { tab: t })}`}
            aria-current={t === tab ? "page" : undefined}
            className={cn(
              "rounded-t-md border border-b-0 px-4 py-2 font-semibold",
              t === tab ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {DOC_TAB_LABEL[t]}
          </Link>
        ))}
      </nav>

      {tab === "receive" && incoming.length > 0 ? (
        <p className="mt-4 rounded-xl border border-amber-400 bg-amber-50 p-4 font-semibold text-amber-950" data-testid="incoming">
          มีหนังสือจากหน่วยในระบบรอลงรับ {incoming.length.toLocaleString("th-TH")} ฉบับ{" "}
          <Link href={`/app/docs/inbox?unit=${unit.id}`} className="underline underline-offset-4">
            ไปที่กล่องหนังสือเข้า
          </Link>
        </p>
      ) : null}

      {tab !== "draft" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="year-nav">
          <span className="font-semibold">ปี พ.ศ.</span>
          {years.map((y) => (
            <Link
              key={y}
              href={`/app/docs?${docsQuery(unit.id, { tab, year: y })}`}
              aria-current={y === year ? "page" : undefined}
              className={cn("rounded-md border px-3 py-1.5", y === year ? "border-primary font-semibold" : "bg-card hover:bg-muted")}
            >
              {y}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <DataTable
          columns={COLUMNS[tab]}
          rows={rows}
          total={table.total}
          page={params.page}
          pageSize={params.pageSize}
          sort={params.sort}
          dir={params.dir}
          q={params.q}
          searchPlaceholder="ค้นหาเลขที่ เรื่อง จาก ถึง"
          filters={[
            { name: "kind", label: "ชนิด", options: DOC_KINDS.map((k) => ({ value: k, label: DOC_KIND_LABEL[k] })) },
            { name: "urgency", label: "ชั้นความเร็ว", options: DOC_URGENCIES.map((u) => ({ value: u, label: DOC_URGENCY_LABEL[u] })) },
            ...(statusOptions.length
              ? [{ name: "status", label: "สถานะ", options: statusOptions.map((s) => ({ value: s, label: DOC_STATUS_LABEL[s] })) }]
              : []),
          ]}
          filterValues={params.filters}
          exportHref={tab === "draft" ? undefined : "/app/docs/export"}
          emptyText={
            tab === "receive"
              ? `ยังไม่มีหนังสือรับในปี ${year}`
              : tab === "send"
                ? `ยังไม่มีหนังสือส่งในปี ${year}`
                : "ไม่มีร่างหนังสือ"
          }
        />
      </div>
    </section>
  );
}
