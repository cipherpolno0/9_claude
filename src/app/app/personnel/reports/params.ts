import "server-only";

import { isReportKind, type ReportKind } from "@/lib/reports";
import { fetchViewRoots, resolveUnit } from "@/lib/reports-server";

type Raw = Record<string, string | string[] | undefined> | URLSearchParams;

function read(raw: Raw, key: string): string {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? "";
  const v = raw[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** อ่านเงื่อนไขรายงานจากที่อยู่หน้าเว็บ (?report= &unit= &fy=) ใช้ร่วมกันทั้งหน้าจอ Excel และหน้าพิมพ์ */
export async function readReportParams(raw: Raw) {
  const kind: ReportKind = isReportKind(read(raw, "report")) ? (read(raw, "report") as ReportKind) : "directory";
  const fy = Number(read(raw, "fy"));
  const fiscalYear = kind === "status" && Number.isInteger(fy) && fy >= 2400 && fy <= 2700 ? fy : null;
  const roots = await fetchViewRoots();
  const unit = await resolveUnit(read(raw, "unit") || undefined, roots);
  return { kind, fiscalYear, roots, unit };
}

export function reportQuery(kind: ReportKind, unitId: string | undefined, fiscalYear: number | null): string {
  const q = new URLSearchParams({ report: kind });
  if (unitId) q.set("unit", unitId);
  if (fiscalYear) q.set("fy", String(fiscalYear));
  return q.toString();
}
