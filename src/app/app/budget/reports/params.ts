import "server-only";

import { isBudgetReportKind, type BudgetReportKind } from "@/lib/budget";

import { budgetQuery, loadBudgetScope } from "../scope";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** ค่าของหน้ารายงาน: ?kind= &year= &unit= &sub=0 (เฉพาะหน่วยนี้) */
export async function readBudgetReportParams(search: Record<string, string | string[] | undefined>) {
  const scope = await loadBudgetScope(search);
  const kind: BudgetReportKind = isBudgetReportKind(one(search.kind)) ? (one(search.kind) as BudgetReportKind) : "plan";
  const sub = one(search.sub) !== "0";
  const query = (extra: Record<string, string> = {}, unitId?: string) =>
    budgetQuery(scope.year, unitId ? { id: unitId } : scope.unit, { kind, ...(sub ? {} : { sub: "0" }), ...extra });
  return { ...scope, kind, sub, query };
}
