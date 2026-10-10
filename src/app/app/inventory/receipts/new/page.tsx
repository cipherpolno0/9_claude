import type { Metadata } from "next";
import Link from "next/link";

import { fetchDisbursementOptions, fetchItemOptions } from "@/lib/inventory-server";

import { loadInventory } from "../../scope";
import { ReceiveForm } from "../../stock-forms";
import { NoAccess, NoWarehouse, WarehouseSelect } from "../../ui";

export const metadata: Metadata = { title: "บันทึกรับวัสดุเข้าคลัง" };
export const dynamic = "force-dynamic";

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, warehouses, warehouse, editable } = await loadInventory(await searchParams);
  const [options, disbursements] = warehouse && editable
    ? await Promise.all([fetchItemOptions(warehouse.id), fetchDisbursementOptions(warehouse.id)])
    : [[], []];
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={`/app/inventory/receipts${warehouse ? `?w=${warehouse.id}` : ""}`} className="text-primary underline underline-offset-4">
          ← รับวัสดุเข้าคลัง
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">บันทึกรับวัสดุเข้าคลัง</h1>
      {!ctx.canViewInventory ? (
        <NoAccess />
      ) : !warehouse ? (
        <NoWarehouse canEdit={ctx.canEditInventory} />
      ) : (
        <>
          <WarehouseSelect warehouses={warehouses} current={warehouse} action="/app/inventory/receipts/new" />
          {editable ? (
            <ReceiveForm key={warehouse.id} warehouse={{ id: warehouse.id, name: warehouse.name }} options={options} disbursements={disbursements} />
          ) : (
            <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
              ท่านไม่มีสิทธิ์รับวัสดุเข้าคลังนี้
            </p>
          )}
        </>
      )}
    </section>
  );
}
