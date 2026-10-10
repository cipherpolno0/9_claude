import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { COUNT_RESULT_LABEL, CONDITION_LABEL, countSummary } from "@/lib/assets";
import { fetchCountDetail } from "@/lib/assets-server";
import { requireMenu } from "@/lib/auth/guards";
import { isUuid } from "@/lib/budget";
import { thaiDate, thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { CountButtons } from "../../assets/asset-forms";
import { CloseCountButton } from "../count-forms";

export const metadata: Metadata = { title: "รอบตรวจนับ" };
export const dynamic = "force-dynamic";

const SHOWS = [
  { key: "unchecked", label: "ยังไม่ตรวจ" },
  { key: "diff", label: "ผลต่าง" },
  { key: "all", label: "ทั้งหมด" },
] as const;

export default async function CountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMenu("/app/inventory");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const c = await fetchCountDetail(id);
  if (!c) notFound();
  const t = countSummary(c.items);
  const s = (await searchParams).show;
  const show = SHOWS.find((x) => x.key === s)?.key ?? (c.status === "open" ? "unchecked" : "diff");
  const items = c.items.filter((i) =>
    show === "all" ? true : show === "unchecked" ? i.result === null : i.result === "missing" || (i.result === "damaged" && i.expected_condition === "usable"),
  );
  const open = c.status === "open";
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/inventory/counts" className="text-primary underline underline-offset-4">
          ← ตรวจนับครุภัณฑ์
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">{c.title}</h1>
      <p className="mt-1 text-muted-foreground">
        {c.unit_name}
        {c.include_sub ? " (รวมหน่วยใต้สังกัด)" : ""} · เริ่ม {thaiDate(c.started_on)} · เปิดรอบโดย {c.created_by_name}
        {c.closed_at ? ` · ปิดรอบ ${thaiDateTime(c.closed_at)} โดย ${c.closed_by_name ?? ""}` : " · กำลังตรวจนับ"}
      </p>
      {c.note ? <p className="mt-1">{c.note}</p> : null}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="count-summary">
        {[
          ["ต้องตรวจ", t.total],
          ["พบ", t.found],
          ["ชำรุด", t.damaged],
          ["ไม่พบ", t.missing],
          [open ? "ยังไม่ตรวจ" : "ผลต่าง", open ? t.unchecked : t.missing + t.changed],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{Number(value).toLocaleString("th-TH")}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-sm text-muted-foreground">ผลต่าง = ไม่พบ + พบว่าชำรุดแต่ทะเบียนเป็น ใช้งานได้</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/app/inventory/reports?kind=count&count=${c.id}&unit=${c.org_unit_id}`}>รายงานผลตรวจนับ (พิมพ์ / Excel)</Link>
        </Button>
        {open ? (
          <Button asChild variant="outline">
            <a href={`/app/inventory/assets/labels?ids=${c.items.slice(0, 300).map((i) => i.asset_id).join(",")}`} target="_blank" rel="noopener">
              พิมพ์ป้าย QR ของรายการในรอบ
            </a>
          </Button>
        ) : null}
      </div>
      {open && c.can_edit ? (
        <div className="mt-4">
          <CloseCountButton id={c.id} unchecked={t.unchecked} />
        </div>
      ) : null}

      <nav aria-label="แสดงรายการ" className="mt-6 -mx-4 overflow-x-auto px-4">
        <ul className="flex min-w-max gap-1 border-b">
          {SHOWS.map((x) => (
            <li key={x.key}>
              <Link
                href={`/app/inventory/counts/${c.id}?show=${x.key}`}
                aria-current={show === x.key ? "page" : undefined}
                className={cn("inline-flex h-11 items-center border-b-2 px-3", show === x.key ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground")}
              >
                {x.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {items.length === 0 ? (
        <p className="mt-4 text-muted-foreground">ไม่มีรายการ</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2" data-testid="count-items">
          {items.map((i) => (
            <li key={i.asset_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3" data-testid="count-item">
              <div className="min-w-0">
                <Link href={`/app/inventory/assets/${i.asset_id}`} prefetch={false} className="font-semibold text-primary underline underline-offset-4">
                  {i.asset_no}
                </Link>{" "}
                {i.name}
                <p className="text-sm text-muted-foreground">
                  {i.unit_name}
                  {i.location ? ` · ${i.location}` : ""} · ทะเบียน: {CONDITION_LABEL[i.expected_condition]} · ผล:{" "}
                  <strong>{i.result ? COUNT_RESULT_LABEL[i.result] : "ยังไม่ตรวจ"}</strong>
                  {i.checked_at && i.result !== "missing" ? ` (${thaiDateTime(i.checked_at)} ${i.checked_by_name ?? ""})` : ""}
                </p>
              </div>
              {open && c.can_edit ? <CountButtons countId={c.id} assetId={i.asset_id} current={i.result} compact /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
