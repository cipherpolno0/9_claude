import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { qty } from "@/lib/inventory";
import { fetchInventorySummary, fetchLowStock, fetchStock } from "@/lib/inventory-server";
import { findWorkspaceMenu } from "@/lib/site";
import { thaiDate } from "@/lib/thai";
import { cn } from "@/lib/utils";

import { loadInventory } from "./scope";
import { InventoryNav, NoAccess, NoWarehouse, WarehouseSelect } from "./ui";

const menu = findWorkspaceMenu("/app/inventory");

export const metadata: Metadata = { title: menu.title };
export const dynamic = "force-dynamic";

/** ภาพรวมคลังวัสดุ: ตัวเลขงานค้าง แจ้งเตือนวัสดุต่ำกว่าจุดสั่งซื้อ และยอดคงเหลือของคลังที่เลือก */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { ctx, warehouses, warehouse, editable } = await loadInventory(search);
  const showAll = search.all === "1";
  const q = typeof search.q === "string" ? search.q.trim().toLowerCase() : "";
  const [summary, low, stock] = await Promise.all([
    fetchInventorySummary(),
    ctx.canViewInventory ? fetchLowStock() : Promise.resolve([]),
    warehouse ? fetchStock(warehouse.id) : Promise.resolve([]),
  ]);
  const rows = stock.filter(
    (r) => (showAll || r.has_moves) && (!q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)),
  );
  const wq = warehouse ? `w=${warehouse.id}` : "";

  const cards = [
    { label: "ใบเบิกของฉันที่ยังไม่จบ", value: summary.my_open, href: "/app/inventory/requisitions?tab=mine", key: "my_open" },
    { label: "ใบเบิกรออนุมัติ", value: summary.to_approve, href: "/app/inventory/requisitions?tab=approve", key: "to_approve" },
    { label: "อนุมัติแล้ว รอจ่ายของ", value: summary.to_issue, href: "/app/inventory/requisitions?tab=issue", key: "to_issue" },
    { label: "ใบโอนรอรับเข้าคลัง", value: summary.incoming, href: "/app/inventory/transfers", key: "incoming" },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{menu.title}</h1>
      <p className="mt-1 text-muted-foreground">คลังวัสดุ: ยอดคงเหลือ รับเข้า ใบเบิก และการโอน (ทะเบียนครุภัณฑ์อยู่ในบทถัดไป)</p>
      <InventoryNav current="/app/inventory" query={wq} />

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="inventory-summary">
        {cards.map((c) => (
          <Link key={c.key} href={c.href} className="rounded-xl border bg-card p-4 hover:bg-secondary" data-testid={`sum-${c.key}`}>
            <dt className="text-sm text-muted-foreground">{c.label}</dt>
            <dd className={cn("text-2xl font-semibold tabular-nums", c.value > 0 && "text-primary")}>{c.value.toLocaleString("th-TH")}</dd>
          </Link>
        ))}
      </dl>

      {!ctx.canViewInventory ? (
        <NoAccess />
      ) : (
        <>
          {low.length > 0 ? (
            <div className="mt-6 rounded-xl border border-amber-400 bg-amber-50 p-4 text-amber-950" data-testid="low-stock" id="low">
              <h2 className="text-lg font-bold">วัสดุต่ำกว่าจุดสั่งซื้อ {low.length.toLocaleString("th-TH")} รายการ</h2>
              <ul className="mt-2 flex flex-col gap-1">
                {low.slice(0, 20).map((r) => (
                  <li key={`${r.warehouse_id}-${r.item_id}`}>
                    <Link
                      href={`/app/inventory/card?w=${r.warehouse_id}&item=${r.item_id}`}
                      prefetch={false}
                      className="underline underline-offset-4"
                    >
                      {r.code} {r.name}
                    </Link>{" "}
                    · {r.warehouse_name} · คงเหลือ <strong>{qty(r.balance)}</strong> {r.unit} (จุดสั่งซื้อ {qty(r.reorder_point)})
                  </li>
                ))}
              </ul>
              {low.length > 20 ? <p className="mt-1 text-sm">แสดง 20 รายการแรก เลือกคลังเพื่อดูทั้งหมด</p> : null}
            </div>
          ) : null}

          {warehouses.length === 0 ? (
            <NoWarehouse canEdit={ctx.canEditInventory} />
          ) : (
            <>
              <WarehouseSelect warehouses={warehouses} current={warehouse} action="/app/inventory" />
              {warehouse ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href={`/app/inventory/requisitions/new?w=${warehouse.id}`}>ยื่นใบเบิก</Link>
                  </Button>
                  {editable ? (
                    <Button asChild variant="outline">
                      <Link href={`/app/inventory/receipts/new?w=${warehouse.id}`}>รับเข้า</Link>
                    </Button>
                  ) : null}
                  {editable && warehouse.kind === "main" ? (
                    <Button asChild variant="outline">
                      <Link href={`/app/inventory/transfers/new?w=${warehouse.id}`}>โอนไปคลังย่อย</Link>
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {warehouse ? (
                <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
                  <h2 className="text-xl font-bold text-primary">ยอดคงเหลือ: {warehouse.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {warehouse.unit_name}
                    {warehouse.parent_name ? ` · คลังย่อยของ${warehouse.parent_name}` : ""} · ยอดคำนวณจากความเคลื่อนไหวทั้งหมด
                  </p>
                  <form method="get" action="/app/inventory" className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="w" value={warehouse.id} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xs">
                      <label htmlFor="stock-q" className="text-sm text-muted-foreground">
                        ค้นหารหัสหรือชื่อวัสดุ
                      </label>
                      <Input id="stock-q" name="q" defaultValue={q} />
                    </div>
                    <label className="flex h-11 items-center gap-2">
                      <input type="checkbox" name="all" value="1" defaultChecked={showAll} className="size-5" />
                      รวมวัสดุที่ยังไม่มีในคลังนี้
                    </label>
                    <Button type="submit" variant="outline">
                      ค้นหา
                    </Button>
                  </form>

                  {rows.length === 0 ? (
                    <p className="mt-4 text-muted-foreground" data-testid="stock-empty">
                      ยังไม่มีวัสดุในคลังนี้{editable ? " เริ่มด้วยการบันทึกรับเข้า" : ""}
                    </p>
                  ) : (
                    <>
                      {/* มือถือ: การ์ด */}
                      <ul className="mt-4 flex flex-col gap-2 sm:hidden" data-testid="stock-cards">
                        {rows.map((r) => (
                          <li key={r.item_id} className={cn("rounded-lg border p-3", r.is_low && "border-amber-400 bg-amber-50")}>
                            <Link href={`/app/inventory/card?w=${warehouse.id}&item=${r.item_id}`} prefetch={false} className="font-semibold text-primary underline underline-offset-4">
                              {r.code} {r.name}
                            </Link>
                            <p className="mt-1 flex flex-wrap justify-between gap-2">
                              <span className="text-muted-foreground">{r.category_name ?? "ไม่ระบุหมวด"}</span>
                              <span className="text-lg font-semibold tabular-nums">
                                {qty(r.balance)} {r.unit}
                              </span>
                            </p>
                            {r.is_low ? <p className="text-sm text-amber-900">ต่ำกว่าจุดสั่งซื้อ ({qty(r.reorder_point)})</p> : null}
                          </li>
                        ))}
                      </ul>
                      {/* จอใหญ่: ตาราง */}
                      <div className="relative mt-4 hidden overflow-x-auto sm:block">
                        <table className="w-full min-w-[720px] border-collapse text-left" data-testid="stock-table">
                          <thead className="bg-secondary">
                            <tr>
                              <th scope="col" className="px-3 py-2">รหัส</th>
                              <th scope="col" className="px-3 py-2">วัสดุ</th>
                              <th scope="col" className="px-3 py-2">หมวด</th>
                              <th scope="col" className="px-3 py-2 text-right">คงเหลือ</th>
                              <th scope="col" className="px-3 py-2 text-right">จุดสั่งซื้อ</th>
                              <th scope="col" className="px-3 py-2">เคลื่อนไหวล่าสุด</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr key={r.item_id} className={cn("border-t", r.is_low && "bg-amber-50")} data-testid="stock-row">
                                <td className="px-3 py-2">{r.code}</td>
                                <td className="px-3 py-2">
                                  <Link href={`/app/inventory/card?w=${warehouse.id}&item=${r.item_id}`} prefetch={false} className="text-primary underline underline-offset-4">
                                    {r.name}
                                  </Link>
                                  {r.is_low ? <span className="ml-2 rounded border border-amber-400 px-1.5 text-sm text-amber-900">ต่ำกว่าจุดสั่งซื้อ</span> : null}
                                  {!r.is_active ? <span className="ml-2 text-sm text-muted-foreground">(ปิดใช้งาน)</span> : null}
                                </td>
                                <td className="px-3 py-2">{r.category_name ?? "-"}</td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {qty(r.balance)} {r.unit}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{Number(r.reorder_point) > 0 ? qty(r.reorder_point) : "-"}</td>
                                <td className="px-3 py-2">{r.last_moved_on ? thaiDate(r.last_moved_on, "short") : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </section>
  );
}
