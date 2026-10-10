import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { baht } from "@/lib/budget";
import { SOURCE_LABEL } from "@/lib/inventory";
import { fetchReceiptRows } from "@/lib/inventory-server";
import { thaiDate } from "@/lib/thai";

import { loadInventory } from "../scope";
import { InventoryNav, NoAccess, NoWarehouse, WarehouseSelect } from "../ui";

export const metadata: Metadata = { title: "รับวัสดุเข้าคลัง" };
export const dynamic = "force-dynamic";

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, warehouses, warehouse, editable } = await loadInventory(await searchParams);
  const rows = warehouse ? await fetchReceiptRows(warehouse.id) : [];
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">รับวัสดุเข้าคลัง</h1>
      <InventoryNav current="/app/inventory/receipts" query={warehouse ? `w=${warehouse.id}` : ""} />
      {!ctx.canViewInventory ? (
        <NoAccess />
      ) : !warehouse ? (
        <NoWarehouse canEdit={ctx.canEditInventory} />
      ) : (
        <>
          <WarehouseSelect warehouses={warehouses} current={warehouse} action="/app/inventory/receipts" />
          {editable ? (
            <div className="mt-4">
              <Button asChild>
                <Link href={`/app/inventory/receipts/new?w=${warehouse.id}`}>บันทึกรับเข้า</Link>
              </Button>
            </div>
          ) : null}
          {rows.length === 0 ? (
            <p className="mt-6 text-muted-foreground">ยังไม่มีการรับเข้าคลังนี้</p>
          ) : (
            <ul className="mt-4 grid gap-2 md:grid-cols-2" data-testid="receipt-list">
              {rows.map((r) => (
                <li key={r.id} className="rounded-lg border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/app/inventory/receipts/${r.id}`} prefetch={false} className="font-semibold text-primary underline underline-offset-4">
                      {r.receipt_no}
                    </Link>
                    <span className="text-sm text-muted-foreground">{thaiDate(r.received_on, "short")}</span>
                  </div>
                  <p className="mt-1">
                    {SOURCE_LABEL[r.source]}
                    {r.supplier ? ` · ${r.supplier}` : ""}
                    {r.document_no ? ` · เลขที่ ${r.document_no}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.line_count} รายการ · มูลค่า {baht(r.total_value)} บาท{r.has_disbursement ? " · อ้างอิงเบิกจ่ายงบ" : ""}
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
