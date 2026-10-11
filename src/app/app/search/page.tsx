import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Mail, MapPinned, Search, School, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireWorkspace } from "@/lib/auth/guards";
import { docRefLabel } from "@/lib/docs";
import { personStatusLabel } from "@/lib/persons";
import { PLACE_STATUS_LABEL, PLACE_TYPE_LABEL, type PlaceStatus, type PlaceType } from "@/lib/places";
import { REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/requests/labels";
import { SEARCH_SHOW } from "@/lib/site-content";
import { workspaceSearch } from "@/lib/site-content-server";
import { thaiDate } from "@/lib/thai";
import { VENUE_STATUS_LABEL, VENUE_TYPE_LABEL, type VenueStatus, type VenueType } from "@/lib/venues";

export const metadata: Metadata = { title: "ค้นหา" };
export const dynamic = "force-dynamic";

type Item = { key: string; href: string; title: string; sub: string };

function Group({
  title,
  icon: Icon,
  items,
  moreHref,
  testId,
}: {
  title: string;
  icon: typeof Users;
  items: Item[];
  moreHref?: string;
  testId: string;
}) {
  const shown = items.slice(0, SEARCH_SHOW);
  return (
    <section className="rounded-xl border bg-card p-5" data-testid={testId}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-primary">
        <Icon className="size-5" aria-hidden />
        {title} ({items.length > SEARCH_SHOW ? `${SEARCH_SHOW}+` : items.length})
      </h2>
      {shown.length === 0 ? (
        <p className="mt-2 text-muted-foreground">ไม่พบ</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {shown.map((i) => (
            <li key={i.key} className="border-b last:border-b-0">
              <Link href={i.href} prefetch={false} className="block py-2 hover:bg-secondary" data-testid="search-hit">
                <span className="block font-semibold text-primary">{i.title}</span>
                <span className="block text-sm text-muted-foreground">{i.sub}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > SEARCH_SHOW && moreHref ? (
        <p className="mt-2">
          <Link href={moreHref} prefetch={false} className="text-primary underline underline-offset-4">
            ดูทั้งหมดในระบบนี้
          </Link>
        </p>
      ) : null}
    </section>
  );
}

/** ค้นหารวมในพื้นที่ทำงาน: พิมพ์ครั้งเดียวค้นบุคคล สถานที่ สนามสอบ คำขอ หนังสือ ตามสิทธิ์เดิมของแต่ละระบบ */
export default async function WorkspaceSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireWorkspace();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : (raw ?? "")).trim().slice(0, 100);
  const r = q.length >= 2 ? await workspaceSearch(q) : { too_short: true };
  const enc = encodeURIComponent(q);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ค้นหา</h1>
      <form method="get" action="/app/search" role="search" className="mt-4 flex flex-wrap gap-2" data-testid="search-page-form">
        <Input type="search" name="q" defaultValue={q} aria-label="คำค้น" placeholder="ชื่อบุคคล สถานที่ สนามสอบ เลขที่คำขอ เลขที่หนังสือ หรือเรื่อง" className="min-w-0 flex-1" maxLength={100} />
        <Button type="submit">
          <Search aria-hidden />
          ค้นหา
        </Button>
      </form>
      <p className="mt-2 text-sm text-muted-foreground">ผลค้นหาแสดงเฉพาะรายการที่ท่านมีสิทธิ์เห็นในแต่ละระบบ ระบบละไม่เกิน {SEARCH_SHOW} รายการ</p>

      {r.too_short ? (
        <p className="mt-6 text-muted-foreground" data-testid="search-short">
          พิมพ์คำค้นอย่างน้อย 2 ตัวอักษร
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2" data-testid="search-groups">
          {r.persons ? (
            <Group
              title="บุคคล"
              icon={Users}
              testId="group-persons"
              moreHref={`/app/personnel?q=${enc}`}
              items={r.persons.map((p) => ({ key: p.id, href: `/app/personnel/${p.id}`, title: p.name, sub: `${p.unit_name} · ${personStatusLabel(p.status, p.person_type)}` }))}
            />
          ) : null}
          {r.places ? (
            <Group
              title="สถานที่"
              icon={School}
              testId="group-places"
              moreHref={`/app/places?q=${enc}`}
              items={r.places.map((p) => ({
                key: p.id,
                href: `/app/places/${p.id}`,
                title: p.name,
                sub: `${PLACE_TYPE_LABEL[p.place_type as PlaceType] ?? p.place_type} · ${p.code || "-"} · ${p.unit_name} · ${PLACE_STATUS_LABEL[p.status as PlaceStatus] ?? p.status}`,
              }))}
            />
          ) : null}
          {r.venues ? (
            <Group
              title="สนามสอบ"
              icon={MapPinned}
              testId="group-venues"
              moreHref={`/app/places/venues?q=${enc}`}
              items={r.venues.map((v) => ({
                key: v.id,
                href: `/app/places/venues/${v.id}`,
                title: v.name,
                sub: `${VENUE_TYPE_LABEL[v.venue_type as VenueType] ?? v.venue_type} · ${v.code || "-"} · ${v.unit_name} · ${VENUE_STATUS_LABEL[v.status as VenueStatus] ?? v.status}`,
              }))}
            />
          ) : null}
          <Group
            title="คำขอ"
            icon={ClipboardList}
            testId="group-requests"
            items={(r.requests ?? []).map((x) => ({
              key: x.id,
              href: `/app/approvals/${x.id}`,
              title: `${x.request_no} · ${x.title}`,
              sub: `${x.type_name} · ${REQUEST_STATUS_LABEL[x.status as RequestStatus] ?? x.status} · ยื่น ${thaiDate(x.submitted_at, "short")}`,
            }))}
          />
          <Group
            title="หนังสือ"
            icon={Mail}
            testId="group-documents"
            moreHref={`/app/docs/search?subject=${enc}&archive=1`}
            items={(r.documents ?? []).map((d) => ({
              key: d.id,
              href: `/app/docs/${d.id}`,
              title: d.subject,
              sub: `${d.direction === "receive" ? "หนังสือรับ" : "หนังสือส่ง"} ${docRefLabel(d)} · ${d.unit_name}${d.closed_at ? " · คลังเก็บ" : ""}`,
            }))}
          />
        </div>
      )}
    </section>
  );
}
