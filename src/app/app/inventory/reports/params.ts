import "server-only";

import { isAssetReportKind, type AssetReportKind } from "@/lib/assets";
import { fetchCountRows } from "@/lib/assets-server";
import { isUuid } from "@/lib/budget";

import { assetQuery, loadAssetScope } from "../assets/scope";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** ค่าของหน้ารายงาน: ?kind= &unit= &sub=0 &year= (ปีงบประมาณ) &count= (รอบตรวจนับ) */
export async function readAssetReportParams(search: Record<string, string | string[] | undefined>) {
  const scope = await loadAssetScope(search);
  const kind: AssetReportKind = isAssetReportKind(one(search.kind)) ? (one(search.kind) as AssetReportKind) : "register";
  const counts = kind === "count" && scope.unit ? await fetchCountRows() : [];
  const wanted = one(search.count);
  const countId =
    kind !== "count"
      ? null
      : (counts.find((c) => c.id === wanted && isUuid(wanted))?.id ?? counts.find((c) => c.org_unit_id === scope.unit?.id)?.id ?? counts[0]?.id ?? null);
  const query = (extra: Record<string, string> = {}, unitId?: string) =>
    assetQuery(unitId ? { id: unitId } : scope.unit, {
      kind,
      sub: scope.sub ? null : "0",
      year: String(scope.year),
      count: kind === "count" ? countId : null,
      ...extra,
    });
  return { ...scope, kind, counts, countId, query };
}
