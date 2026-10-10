import "server-only";

import { isListReportKind, type ListReportKind } from "@/lib/exam-lists";
import { isUuid } from "@/lib/exam-lists-server";
import { fetchAccessibleUnits, type AccessibleOrgUnit } from "@/lib/org-units-server";

import { fetchListYears, read } from "../params";

type Raw = Record<string, string | string[] | undefined> | URLSearchParams;

/** อ่านเงื่อนไขรายงานสรุป (?kind= &year= &unit=) เขตเริ่มต้น = หน่วยบนสุดที่ผู้ใช้เลือกได้ ใช้ร่วมกันทั้งหน้าจอ Excel และหน้าพิมพ์ */
export async function readListReportParams(raw: Raw) {
  const [years, units] = await Promise.all([fetchListYears(), fetchAccessibleUnits()]);
  const kind: ListReportKind = isListReportKind(read(raw, "kind")) ? (read(raw, "kind") as ListReportKind) : "counts";
  const y = Number(read(raw, "year"));
  const year = years.includes(y) ? y : (years[0] ?? null);
  const selectable = units.filter((u) => u.selectable);
  const ids = new Set(selectable.map((u) => u.id));
  const roots = selectable.filter((u) => !u.parent_id || !ids.has(u.parent_id));
  const wanted = read(raw, "unit");
  const unit: AccessibleOrgUnit | null = (isUuid(wanted) ? selectable.find((u) => u.id === wanted) : null) ?? roots[0] ?? null;
  return { kind, years, year, units, unit, isRoot: unit ? roots.some((r) => r.id === unit.id) : false };
}

export function listReportQuery(kind: ListReportKind, year: number | null, unitId: string | null | undefined) {
  const q = new URLSearchParams({ kind });
  if (year) q.set("year", String(year));
  if (unitId) q.set("unit", unitId);
  return q.toString();
}
