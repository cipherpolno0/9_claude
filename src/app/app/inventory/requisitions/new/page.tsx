import type { Metadata } from "next";
import Link from "next/link";

import { fetchItemOptions } from "@/lib/inventory-server";

import { loadInventory } from "../../scope";
import { RequisitionForm } from "../../stock-forms";
import { NoAccess, NoWarehouse, WarehouseSelect } from "../../ui";

export const metadata: Metadata = { title: "ยื่นใบเบิกวัสดุ" };
export const dynamic = "force-dynamic";

export default async function NewRequisitionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, warehouses, warehouse } = await loadInventory(await searchParams);
  const options = warehouse ? await fetchItemOptions(warehouse.id) : [];
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/inventory/requisitions" className="text-primary underline underline-offset-4">
          ← ใบเบิกวัสดุ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ยื่นใบเบิกวัสดุ</h1>
      {!ctx.canViewInventory ? (
        <NoAccess />
      ) : !warehouse ? (
        <NoWarehouse canEdit={ctx.canEditInventory} />
      ) : (
        <>
          <WarehouseSelect warehouses={warehouses} current={warehouse} action="/app/inventory/requisitions/new" />
          <RequisitionForm key={warehouse.id} warehouse={{ id: warehouse.id, name: warehouse.name }} options={options} />
        </>
      )}
    </section>
  );
}
