import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { WAREHOUSE_KIND_LABEL, qty } from "@/lib/inventory";
import { fetchCategories, fetchInventoryEditUnits, fetchItems, fetchWarehouses } from "@/lib/inventory-server";
import { cn } from "@/lib/utils";

import { canEditUnit, loadInventory } from "../scope";
import { InventoryNav, NoAccess } from "../ui";
import { CategoryForm, NewWarehouseForm, WarehouseEditor } from "./settings-forms";

export const metadata: Metadata = { title: "ตั้งค่าคลังวัสดุ" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "warehouses", label: "คลัง" },
  { key: "items", label: "วัสดุ" },
  { key: "categories", label: "หมวดวัสดุ" },
] as const;

export default async function InventorySettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { ctx } = await loadInventory(search);
  const tab = TABS.find((t) => t.key === search.tab)?.key ?? "warehouses";

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">ตั้งค่าคลังวัสดุ</h1>
      <InventoryNav current="/app/inventory/settings" />
      <nav aria-label="หัวข้อตั้งค่า" className="mt-4 -mx-4 overflow-x-auto px-4">
        <ul className="flex min-w-max gap-1 border-b">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={`/app/inventory/settings?tab=${t.key}`}
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
      {!ctx.canViewInventory ? (
        <NoAccess />
      ) : tab === "warehouses" ? (
        <WarehousesTab canEdit={ctx.canEditInventory} />
      ) : tab === "items" ? (
        <ItemsTab canEdit={ctx.canEditInventory} showInactive={search.inactive === "1"} />
      ) : (
        <CategoriesTab isAdmin={ctx.isAdmin} />
      )}
    </section>
  );
}

async function WarehousesTab({ canEdit }: { canEdit: boolean }) {
  const [warehouses, units] = await Promise.all([fetchWarehouses({ includeInactive: true }), canEdit ? fetchInventoryEditUnits() : Promise.resolve([])]);
  const editable = new Set<string>();
  for (const unitId of new Set(warehouses.map((w) => w.org_unit_id))) {
    if (await canEditUnit(unitId, canEdit)) editable.add(unitId);
  }
  const mains = warehouses.filter((w) => w.kind === "main" && w.is_active);
  return (
    <div className="mt-4 flex flex-col gap-6">
      <ul className="flex flex-col gap-2" data-testid="warehouse-list">
        {warehouses.length === 0 ? <li className="text-muted-foreground">ยังไม่มีคลังในเขตของท่าน</li> : null}
        {warehouses.map((w) => (
          <li key={w.id} className={cn("rounded-lg border bg-card p-3", !w.is_active && "opacity-70")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">
                  {w.name} <span className="text-sm font-normal text-muted-foreground">({w.code})</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {WAREHOUSE_KIND_LABEL[w.kind]} · {w.unit_name}
                  {w.parent_name ? ` · สังกัด${w.parent_name}` : ""}
                  {w.is_active ? "" : " · ปิดใช้งาน"}
                </p>
                {w.note ? <p className="text-sm">{w.note}</p> : null}
              </div>
              {editable.has(w.org_unit_id) ? <WarehouseEditor w={w} /> : null}
            </div>
          </li>
        ))}
      </ul>
      {canEdit && units.some((u) => u.selectable) ? (
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-xl font-bold text-primary">เพิ่มคลัง</h2>
          <NewWarehouseForm units={units} mains={mains} />
        </div>
      ) : null}
    </div>
  );
}

async function ItemsTab({ canEdit, showInactive }: { canEdit: boolean; showInactive: boolean }) {
  const items = await fetchItems({ includeInactive: showInactive });
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? (
          <Button asChild>
            <Link href="/app/inventory/settings/items/new">เพิ่มวัสดุ</Link>
          </Button>
        ) : null}
        <Link href={`/app/inventory/settings?tab=items${showInactive ? "" : "&inactive=1"}`} className="text-primary underline underline-offset-4">
          {showInactive ? "ซ่อนวัสดุที่ปิดใช้งาน" : "แสดงวัสดุที่ปิดใช้งานด้วย"}
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">ทะเบียนวัสดุชุดเดียวทั้งระบบ ใช้ร่วมกันทุกคลัง</p>
      {items.length === 0 ? (
        <p className="mt-4 text-muted-foreground">ยังไม่มีวัสดุในทะเบียน</p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="item-list">
          {items.map((i) => (
            <li key={i.id} className={cn("rounded-lg border bg-card p-3", !i.is_active && "opacity-70")}>
              <Link href={`/app/inventory/settings/items/${i.id}`} prefetch={false} className="font-semibold text-primary underline underline-offset-4">
                {i.code} {i.name}
              </Link>
              <p className="text-sm text-muted-foreground">
                {i.category_name ?? "ไม่ระบุหมวด"} · หน่วยนับ {i.unit} · จุดสั่งซื้อ {Number(i.reorder_point) > 0 ? qty(i.reorder_point) : "-"}
                {i.is_active ? "" : " · ปิดใช้งาน"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function CategoriesTab({ isAdmin }: { isAdmin: boolean }) {
  const categories = await fetchCategories({ includeInactive: true });
  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="text-muted-foreground">หมวดวัสดุใช้จัดกลุ่มในทะเบียนวัสดุ {isAdmin ? "" : "(เพิ่มและแก้ไขได้เฉพาะผู้ดูแลระบบ)"}</p>
      {categories.length === 0 ? <p className="text-muted-foreground">ยังไม่มีหมวดวัสดุ</p> : null}
      {isAdmin ? (
        <>
          {categories.map((c) => (
            <div key={c.id} className="rounded-lg border bg-card p-3">
              <CategoryForm c={c} />
            </div>
          ))}
          <div className="rounded-xl border bg-card p-4">
            <CategoryForm />
          </div>
        </>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="category-list">
          {categories.map((c) => (
            <li key={c.id}>
              {c.name}
              {c.is_active ? "" : " (ปิดใช้งาน)"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
