import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { Field, selectClass } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import {
  DOC_KIND_LABEL,
  DOC_KINDS,
  DOC_STATUS_LABEL,
  DOC_URGENCIES,
  DOC_URGENCY_LABEL,
  docRefLabel,
  searchIsEmpty,
  type DocSearch,
} from "@/lib/docs";
import { fetchDocsCounts, searchDocuments } from "@/lib/docs-server";
import { thaiDate } from "@/lib/thai";

import { loadDocsScope } from "../scope";
import { DocBadges, DocsNav, DocsNoAccess } from "../ui";

export const metadata: Metadata = { title: "ค้นหาหนังสือ" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : (v ?? "")).trim().slice(0, 200);

function readSearch(sp: Record<string, string | string[] | undefined>): DocSearch {
  return {
    unit: one(sp.unit),
    no: one(sp.no),
    subject: one(sp.subject),
    from: one(sp.from),
    to: one(sp.to),
    df: one(sp.df),
    dt: one(sp.dt),
    kind: one(sp.kind),
    urgency: one(sp.urgency),
    dir: one(sp.dir),
    body: one(sp.body),
    archive: one(sp.archive) === "1",
  };
}

/** ค้นหาหนังสือ: ทุกหน่วยที่ผู้ใช้ดูสารบรรณได้ (หรือหน่วยที่เลือก) เฉพาะหนังสือที่ผู้ใช้เห็น */
export default async function DocsSearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { ctx, units } = await loadDocsScope({});
  const s = readSearch(sp);
  const page = Math.max(1, Math.min(500, Number(one(sp.page)) || 1));
  const counts = await fetchDocsCounts();
  const empty = searchIsEmpty(s);
  const result = !ctx.canViewDocs || empty ? null : await searchDocuments(s, page, PAGE_SIZE);
  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const pageHref = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(s)) {
      if (k === "archive") {
        if (v) q.set("archive", "1");
      } else if (v) q.set(k, String(v));
    }
    q.set("page", String(p));
    return `/app/docs/search?${q.toString()}`;
  };

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ค้นหาหนังสือ</h1>
      <DocsNav current="search" counts={counts} showRegister={ctx.canViewDocs} />
      {!ctx.canViewDocs ? (
        <DocsNoAccess isAdmin={ctx.isAdmin} />
      ) : (
        <>
          <form method="get" action="/app/docs/search" className="mt-6 flex flex-col gap-4 rounded-xl border bg-card p-5" data-testid="search-form">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="เลขที่หนังสือ / เลขรับ" name="no" id="s-no" defaultValue={s.no} maxLength={80} placeholder="เช่น พศ 0001/12" />
              <Field label="เรื่อง" name="subject" id="s-subject" defaultValue={s.subject} maxLength={200} />
              <Field label="จาก" name="from" id="s-from" defaultValue={s.from} maxLength={200} />
              <Field label="ถึง" name="to" id="s-to" defaultValue={s.to} maxLength={200} />
              <ThaiDateInput label="ลงวันที่ ตั้งแต่" name="df" defaultValue={s.df} />
              <ThaiDateInput label="ถึงวันที่" name="dt" defaultValue={s.dt} />
            </div>
            <Field
              label="ค้นในเนื้อความ"
              name="body"
              id="s-body"
              defaultValue={s.body}
              maxLength={200}
              hint="ค้นในเนื้อความของหนังสือส่ง และของต้นฉบับที่ส่งผ่านระบบ ไม่ค้นในเนื้อความของหนังสือลับ"
            />
            <div className="grid gap-4 sm:grid-cols-4">
              <label className="flex flex-col gap-1 font-medium">
                ทะเบียน
                <select name="dir" defaultValue={s.dir} className={selectClass}>
                  <option value="">ทั้งรับและส่ง</option>
                  <option value="receive">หนังสือรับ</option>
                  <option value="send">หนังสือส่ง</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 font-medium">
                ชนิด
                <select name="kind" defaultValue={s.kind} className={selectClass}>
                  <option value="">ทุกชนิด</option>
                  {DOC_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {DOC_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 font-medium">
                ชั้นความเร็ว
                <select name="urgency" defaultValue={s.urgency} className={selectClass}>
                  <option value="">ทุกชั้น</option>
                  {DOC_URGENCIES.map((u) => (
                    <option key={u} value={u}>
                      {DOC_URGENCY_LABEL[u]}
                    </option>
                  ))}
                </select>
              </label>
              {units.length > 1 ? (
                <label className="flex flex-col gap-1 font-medium">
                  หน่วย
                  <select name="unit" defaultValue={s.unit} className={selectClass}>
                    <option value="">ทุกหน่วยของท่าน</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="archive" value="1" defaultChecked={s.archive} className="size-5" />
              รวมหนังสือในคลังเก็บ (ปิดเรื่องแล้ว)
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">
                <Search aria-hidden />
                ค้นหา
              </Button>
              <Button asChild variant="outline">
                <Link href="/app/docs/search">ล้างเงื่อนไข</Link>
              </Button>
            </div>
          </form>

          {empty ? (
            <p className="mt-6 text-muted-foreground">กรอกเงื่อนไขอย่างน้อย 1 ช่องแล้วกด ค้นหา</p>
          ) : result ? (
            <section className="mt-6" data-testid="search-results">
              <p className="font-semibold" data-testid="search-total">
                พบ {result.total.toLocaleString("th-TH")} ฉบับ
              </p>
              {result.rows.length ? (
                <ul className="mt-3 flex flex-col gap-3">
                  {result.rows.map((r) => (
                    <li key={r.id} className="rounded-xl border bg-card p-4" data-testid="search-row">
                      <p className="text-sm text-muted-foreground">
                        {r.direction === "receive" ? "หนังสือรับ" : "หนังสือส่ง"} · {docRefLabel(r)} · ลงวันที่ {thaiDate(r.doc_date, "short")} ·{" "}
                        {DOC_KIND_LABEL[r.kind]} · {DOC_STATUS_LABEL[r.status]}
                        {r.closed_at ? " · คลังเก็บ" : ""}
                      </p>
                      <p className="mt-1">
                        <DocBadges urgency={r.urgency} classification={r.classification} />
                        <Link href={`/app/docs/${r.id}`} prefetch={false} className="font-semibold text-primary underline underline-offset-4">
                          {r.subject}
                        </Link>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {r.direction === "receive" ? `จาก ${r.from_text || "-"}` : `ถึง ${r.to_text || "-"}`}
                        {units.length > 1 ? ` · ${r.unit_name}` : ""}
                      </p>
                      {r.snippet ? (
                        <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-sm whitespace-pre-wrap" data-testid="search-snippet">
                          {r.snippet}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-muted-foreground">ไม่พบหนังสือที่ตรงกับเงื่อนไข</p>
              )}
              {pages > 1 ? (
                <nav aria-label="หน้า" className="mt-4 flex flex-wrap items-center gap-2">
                  {page > 1 ? (
                    <Button asChild variant="outline">
                      <Link href={pageHref(page - 1)}>ก่อนหน้า</Link>
                    </Button>
                  ) : null}
                  <span>
                    หน้า {page} / {pages}
                  </span>
                  {page < pages ? (
                    <Button asChild variant="outline">
                      <Link href={pageHref(page + 1)}>ถัดไป</Link>
                    </Button>
                  ) : null}
                </nav>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
