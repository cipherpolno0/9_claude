import type { Metadata } from "next";
import Link from "next/link";

import { requireMenu } from "@/lib/auth/guards";
import { fetchAssetTypes, fetchSourceOptions } from "@/lib/assets-server";
import { fetchInventoryEditUnits } from "@/lib/inventory-server";

import { AssetForm } from "../asset-forms";

export const metadata: Metadata = { title: "เพิ่มครุภัณฑ์" };
export const dynamic = "force-dynamic";

export default async function NewAssetPage() {
  const ctx = await requireMenu("/app/inventory");
  const [types, sources, units] = ctx.canEditInventory
    ? await Promise.all([fetchAssetTypes(), fetchSourceOptions(), fetchInventoryEditUnits()])
    : [[], [], []];
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/inventory/assets" className="text-primary underline underline-offset-4">
          ← ทะเบียนครุภัณฑ์
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">เพิ่มครุภัณฑ์</h1>
      {!ctx.canEditInventory ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          ท่านไม่มีสิทธิ์เพิ่มครุภัณฑ์
        </p>
      ) : types.length === 0 ? (
        <p className="mt-4 rounded-lg border bg-card px-4 py-3" data-testid="no-types">
          ยังไม่มีประเภทครุภัณฑ์ ผู้ดูแลระบบต้องเพิ่มประเภทและอายุการใช้งานที่ ตั้งค่า &gt; ประเภทครุภัณฑ์ ก่อน
        </p>
      ) : (
        <div className="mt-4 rounded-xl border bg-card p-4 sm:p-5">
          <AssetForm types={types} sources={sources} units={units} />
        </div>
      )}
    </section>
  );
}
