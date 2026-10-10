import type { Metadata } from "next";

import { assetUrl, qrSvg } from "@/lib/asset-qr";
import { fetchAssetDetail, fetchAssetRows } from "@/lib/assets-server";
import { isUuid } from "@/lib/budget";

import { loadAssetScope } from "../scope";
import { LabelsSheet, type Label } from "./labels-sheet";

export const metadata: Metadata = { title: "พิมพ์ป้ายครุภัณฑ์" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : (v ?? ""));

/** ป้าย QR: ?ids=รหัส,รหัส (เลือกเอง) หรือ ตามตัวกรองของหน้าทะเบียน (?unit &sub &q &type &cond) ไม่รวมที่จำหน่ายแล้ว สูงสุด 300 ป้าย */
export default async function LabelsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { unit, sub } = await loadAssetScope(search);
  const ids = one(search.ids).split(",").filter(isUuid).slice(0, 300);
  let items: { id: string; asset_no: string; name: string; unit_name: string; condition: string }[] = [];
  if (ids.length) {
    items = (await Promise.all(ids.map(fetchAssetDetail))).filter((a) => a !== null);
  } else if (unit) {
    const q = one(search.q).trim().toLowerCase();
    const type = one(search.type);
    const cond = one(search.cond);
    items = (await fetchAssetRows(unit.id, sub)).filter(
      (a) =>
        (!q || [a.asset_no, a.name, a.brand, a.model, a.serial_no, a.location, a.custodian].some((v) => v.toLowerCase().includes(q))) &&
        (!type || a.type_id === type) &&
        (!cond || a.condition === cond),
    );
  }
  const labels: Label[] = await Promise.all(
    items
      .filter((a) => a.condition !== "disposed")
      .slice(0, 300)
      .map(async (a) => ({ id: a.id, assetNo: a.asset_no, name: a.name, unitName: a.unit_name, svg: await qrSvg(await assetUrl(a.id)) })),
  );
  return <LabelsSheet labels={labels} />;
}
