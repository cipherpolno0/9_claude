import type { Metadata } from "next";
import Link from "next/link";

import { warehouseLabel } from "@/lib/inventory";
import { fetchItemOptions } from "@/lib/inventory-server";

import { loadInventory } from "../../scope";
import { TransferForm } from "../../stock-forms";
import { NoAccess } from "../../ui";

export const metadata: Metadata = { title: "โอนวัสดุไปคลังย่อย" };
export const dynamic = "force-dynamic";

export default async function NewTransferPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, warehouses, warehouse, editable } = await loadInventory(await searchParams);
  const subs = warehouse ? warehouses.filter((w) => w.parent_id === warehouse.id) : [];
  const options = warehouse && editable ? (await fetchItemOptions(warehouse.id)).filter((o) => o.balance > 0) : [];
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/inventory/transfers" className="text-primary underline underline-offset-4">
          ← โอนวัสดุ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">โอนวัสดุไปคลังย่อย</h1>
      {!ctx.canViewInventory ? (
        <NoAccess />
      ) : !warehouse || warehouse.kind !== "main" || !editable ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          โอนได้จากคลังกลางที่ท่านมีสิทธิ์แก้ไขเท่านั้น
        </p>
      ) : subs.length === 0 ? (
        <p className="mt-4 rounded-lg border bg-card px-4 py-3">
          {warehouse.name} ยังไม่มีคลังย่อย เพิ่มได้ที่{" "}
          <Link href="/app/inventory/settings?tab=warehouses" className="text-primary underline underline-offset-4">
            ตั้งค่า &gt; คลัง
          </Link>
        </p>
      ) : (
        <TransferForm
          from={{ id: warehouse.id, name: warehouse.name }}
          subs={subs.map((s) => ({ id: s.id, label: `${warehouseLabel(s)} · ${s.unit_name}` }))}
          options={options}
        />
      )}
    </section>
  );
}
