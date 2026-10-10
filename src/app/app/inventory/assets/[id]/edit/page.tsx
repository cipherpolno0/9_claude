import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireMenu } from "@/lib/auth/guards";
import { fetchAssetDetail, fetchAssetTypes, fetchSourceOptions } from "@/lib/assets-server";
import { isUuid } from "@/lib/budget";

import { AssetForm } from "../../asset-forms";

export const metadata: Metadata = { title: "แก้ไขครุภัณฑ์" };
export const dynamic = "force-dynamic";

export default async function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMenu("/app/inventory");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const a = await fetchAssetDetail(id);
  if (!a) notFound();
  const [types, sources] = await Promise.all([fetchAssetTypes({ includeInactive: true }), fetchSourceOptions()]);
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={`/app/inventory/assets/${a.id}`} className="text-primary underline underline-offset-4">
          ← {a.asset_no} {a.name}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">แก้ไขครุภัณฑ์</h1>
      {!a.can_edit ? (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          แก้ไขไม่ได้ (ไม่มีสิทธิ์ ปิดใช้งาน หรือจำหน่ายแล้ว)
        </p>
      ) : (
        <div className="mt-4 rounded-xl border bg-card p-4 sm:p-5">
          <AssetForm
            types={types}
            sources={sources}
            units={[]}
            asset={{
              id: a.id,
              unitName: a.unit_name,
              assetNo: a.asset_no,
              name: a.name,
              typeId: a.type_id,
              brand: a.brand,
              model: a.model,
              serialNo: a.serial_no,
              acquiredOn: a.acquired_on,
              method: a.acquire_method,
              price: String(Number(a.price)),
              sourceId: a.source_id ?? "",
              lifeYears: a.useful_life_years ? String(a.useful_life_years) : "",
              location: a.location,
              custodian: a.custodian,
              condition: a.condition,
              note: a.note,
            }}
          />
        </div>
      )}
    </section>
  );
}
