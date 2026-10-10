import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { REQUISITION_TABS, isRequisitionTab } from "@/lib/inventory";
import { fetchRequisitionRows } from "@/lib/inventory-server";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { loadInventory } from "../scope";
import { InventoryNav, RequisitionBadge } from "../ui";

export const metadata: Metadata = { title: "ใบเบิกวัสดุ" };
export const dynamic = "force-dynamic";

/** ใบเบิก: ของฉัน / รออนุมัติ (ผู้พิจารณา) / รอจ่ายของ (เจ้าหน้าที่พัสดุ) / ทั้งหมดในเขต */
export default async function RequisitionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { ctx, warehouse } = await loadInventory(search);
  const tab = isRequisitionTab(search.tab) ? search.tab : "mine";
  const rows = await fetchRequisitionRows(tab);
  const tabs = REQUISITION_TABS.filter((t) => (t.key === "issue" ? ctx.canEditInventory : t.key === "all" ? ctx.canViewInventory : true));

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ใบเบิกวัสดุ</h1>
      <InventoryNav current="/app/inventory/requisitions" />
      {ctx.canViewInventory && warehouse ? (
        <div className="mt-4">
          <Button asChild>
            <Link href={`/app/inventory/requisitions/new?w=${warehouse.id}`}>ยื่นใบเบิก</Link>
          </Button>
        </div>
      ) : null}
      <nav aria-label="ประเภทใบเบิก" className="mt-4 -mx-4 overflow-x-auto px-4">
        <ul className="flex min-w-max gap-1 border-b">
          {tabs.map((t) => (
            <li key={t.key}>
              <Link
                href={`/app/inventory/requisitions?tab=${t.key}`}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center border-b-2 px-3",
                  tab === t.key ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {rows.length === 0 ? (
        <p className="mt-6 text-muted-foreground" data-testid="req-empty">
          {tab === "approve" ? "ไม่มีใบเบิกที่รอท่านพิจารณา" : tab === "issue" ? "ไม่มีใบเบิกที่รอจ่ายของ" : "ยังไม่มีใบเบิก"}
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-2 md:hidden" data-testid="req-cards">
            {rows.map((r) => (
              <li key={r.id} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/app/inventory/requisitions/${r.id}`} prefetch={false} className="font-semibold text-primary underline underline-offset-4">
                    {r.request_no ?? "ใบเบิก"}
                  </Link>
                  <RequisitionBadge status={r.status} />
                </div>
                <p className="mt-1 line-clamp-2">{r.purpose}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {r.warehouse_name} · {r.line_count} รายการ · {thaiDate(r.created_at, "short")}
                  {r.is_mine ? "" : ` · ${r.requester_name ?? ""}`}
                </p>
              </li>
            ))}
          </ul>
          <div className="relative mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[800px] border-collapse text-left" data-testid="req-table">
              <thead className="bg-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2">เลขที่</th>
                  <th scope="col" className="px-3 py-2">วันที่ยื่น</th>
                  <th scope="col" className="px-3 py-2">คลัง</th>
                  <th scope="col" className="px-3 py-2">วัตถุประสงค์</th>
                  <th scope="col" className="px-3 py-2 text-right">รายการ</th>
                  <th scope="col" className="px-3 py-2">ผู้ยื่น</th>
                  <th scope="col" className="px-3 py-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t align-top" data-testid="req-row">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link href={`/app/inventory/requisitions/${r.id}`} prefetch={false} className="text-primary underline underline-offset-4">
                        {r.request_no ?? "ใบเบิก"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{thaiDate(r.created_at, "short")}</td>
                    <td className="px-3 py-2">{r.warehouse_name}</td>
                    <td className="px-3 py-2">{r.purpose}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.line_count}</td>
                    <td className="px-3 py-2">{r.requester_name}</td>
                    <td className="px-3 py-2">
                      <RequisitionBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
