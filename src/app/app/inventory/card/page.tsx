import type { Metadata } from "next";
import Link from "next/link";

import { selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { isUuid } from "@/lib/budget";
import { qty } from "@/lib/inventory";
import { fetchItemPhotoUrl, fetchStock, fetchStockCard } from "@/lib/inventory-server";

import { loadInventory } from "../scope";
import { InventoryNav, NoAccess, NoWarehouse, WarehouseSelect } from "../ui";
import { AdjustForm } from "./adjust-form";
import { CardTable } from "./card-table";

export const metadata: Metadata = { title: "Stock Card" };
export const dynamic = "force-dynamic";

/** Stock Card ต่อวัสดุต่อคลัง: วันที่ รับ จ่าย คงเหลือ พิมพ์และส่งออก Excel ได้ ปรับยอดได้ (ผู้มีสิทธิ์แก้ไข) */
export default async function StockCardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { ctx, warehouses, warehouse, editable } = await loadInventory(search);
  const stock = warehouse ? await fetchStock(warehouse.id) : [];
  const itemId = typeof search.item === "string" && isUuid(search.item) ? search.item : null;
  const item = stock.find((s) => s.item_id === itemId) ?? null;
  const [rows, photo] = warehouse && item ? await Promise.all([fetchStockCard(warehouse.id, item.item_id), fetchItemPhotoUrl(item.item_id)]) : [null, null];
  const q = warehouse && item ? `w=${warehouse.id}&item=${item.item_id}` : "";

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">บัญชีวัสดุ (Stock Card)</h1>
      <InventoryNav current="/app/inventory" query={warehouse ? `w=${warehouse.id}` : ""} />
      {!ctx.canViewInventory ? (
        <NoAccess />
      ) : !warehouse ? (
        <NoWarehouse canEdit={ctx.canEditInventory} />
      ) : (
        <>
          <WarehouseSelect warehouses={warehouses} current={warehouse} action="/app/inventory/card" />
          <form method="get" action="/app/inventory/card" className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="w" value={warehouse.id} />
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
              <label htmlFor="pick-item" className="text-sm text-muted-foreground">
                วัสดุ
              </label>
              <select id="pick-item" name="item" defaultValue={item?.item_id ?? ""} className={selectClass}>
                <option value="">เลือกวัสดุ</option>
                {stock.map((s) => (
                  <option key={s.item_id} value={s.item_id}>
                    {s.code} {s.name} (คงเหลือ {qty(s.balance)} {s.unit})
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline">
              แสดง
            </Button>
          </form>

          {item && rows ? (
            <>
              <div className="mt-6 flex flex-wrap items-start gap-4 rounded-xl border bg-card p-4 sm:p-5">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ลิงก์ชั่วคราวจากที่เก็บไฟล์ส่วนตัว
                  <img src={photo} alt={`รูป${item.name}`} className="size-24 rounded-lg border object-cover" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold text-primary">
                    {item.code} {item.name}
                  </h2>
                  <p className="text-muted-foreground">
                    {warehouse.name} · หมวด {item.category_name ?? "-"} · จุดสั่งซื้อ {Number(item.reorder_point) > 0 ? `${qty(item.reorder_point)} ${item.unit}` : "-"}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid="card-balance">
                    คงเหลือ {qty(item.balance)} {item.unit}
                  </p>
                  {item.is_low ? <p className="text-amber-900">ต่ำกว่าจุดสั่งซื้อ</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <a href={`/app/inventory/card/print?${q}`} target="_blank" rel="noopener">
                      พิมพ์
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a href={`/app/inventory/card/export?${q}`}>ส่งออก Excel</a>
                  </Button>
                </div>
              </div>
              {rows.length === 0 ? (
                <p className="mt-4 text-muted-foreground">ยังไม่มีความเคลื่อนไหวของวัสดุนี้ในคลังนี้</p>
              ) : (
                <div className="relative mt-4 overflow-x-auto">
                  <CardTable rows={rows} unit={item.unit} />
                </div>
              )}
              {editable ? (
                <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
                  <h2 className="text-xl font-bold text-primary">ปรับยอด</h2>
                  <p className="mt-1 text-muted-foreground">
                    ใช้เมื่อนับแล้วไม่ตรง ชำรุด สูญหาย หรือบันทึกผิด (ความเคลื่อนไหวที่บันทึกแล้วแก้หรือลบไม่ได้) จำนวนบวก = เพิ่ม ลบ = ลด ยอดหลังปรับห้ามติดลบ
                  </p>
                  <div className="mt-3">
                    <AdjustForm warehouse={warehouse.id} item={item.item_id} unit={item.unit} />
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-6 text-muted-foreground">
              เลือกวัสดุเพื่อดู Stock Card หรือเลือกจาก{" "}
              <Link href={`/app/inventory?w=${warehouse.id}`} className="text-primary underline underline-offset-4">
                ยอดคงเหลือ
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  );
}
