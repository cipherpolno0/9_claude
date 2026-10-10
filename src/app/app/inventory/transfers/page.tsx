import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { fetchTransferRows } from "@/lib/inventory-server";
import { thaiDate } from "@/lib/thai";

import { loadInventory } from "../scope";
import { InventoryNav, NoAccess, TransferBadge } from "../ui";

export const metadata: Metadata = { title: "โอนวัสดุ" };
export const dynamic = "force-dynamic";

export default async function TransfersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, warehouses, warehouse } = await loadInventory(await searchParams);
  const rows = ctx.canViewInventory ? await fetchTransferRows(null) : [];
  const mains = warehouses.filter((w) => w.kind === "main" && warehouses.some((s) => s.parent_id === w.id));
  const pending = rows.filter((r) => r.status === "sent");
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">โอนวัสดุจากคลังกลางไปคลังย่อย</h1>
      <InventoryNav current="/app/inventory/transfers" query={warehouse ? `w=${warehouse.id}` : ""} />
      {!ctx.canViewInventory ? (
        <NoAccess />
      ) : (
        <>
          {ctx.canEditInventory && mains.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {mains.map((m) => (
                <Button key={m.id} asChild variant={mains.length === 1 ? "default" : "outline"}>
                  <Link href={`/app/inventory/transfers/new?w=${m.id}`}>โอนออกจาก{m.name}</Link>
                </Button>
              ))}
            </div>
          ) : null}
          {pending.some((r) => r.can_receive) ? (
            <p className="mt-4 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-amber-950" data-testid="incoming-alert">
              มีใบโอนรอท่านกดรับเข้าคลัง {pending.filter((r) => r.can_receive).length} ใบ
            </p>
          ) : null}
          {rows.length === 0 ? (
            <p className="mt-6 text-muted-foreground">ยังไม่มีการโอน</p>
          ) : (
            <ul className="mt-4 grid gap-2 md:grid-cols-2" data-testid="transfer-list">
              {rows.map((r) => (
                <li key={r.id} className="rounded-lg border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/app/inventory/transfers/${r.id}`} prefetch={false} className="font-semibold text-primary underline underline-offset-4">
                      {r.transfer_no}
                    </Link>
                    <TransferBadge status={r.status} />
                  </div>
                  <p className="mt-1">
                    {r.from_name} → {r.to_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.line_count} รายการ · โอน {thaiDate(r.sent_on, "short")}
                    {r.received_on ? ` · รับ ${thaiDate(r.received_on, "short")}` : ""}
                    {r.can_receive ? " · รอท่านรับ" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
