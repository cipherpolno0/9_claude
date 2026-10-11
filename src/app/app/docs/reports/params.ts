import "server-only";

import { currentYearBe, isDocReportKind, type DocReportKind } from "@/lib/docs";
import { bkkDate } from "@/lib/docs-track";
import { fiscalYearOf } from "@/lib/reports";

import { docsQuery, loadDocsScope } from "../scope";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : (v ?? ""));

/** ค่าของหน้ารายงานสารบรรณ: ?kind= &unit= &dir=receive|send &year=พ.ศ. &month=1-12 &fy=ปีงบประมาณ */
export async function readDocsReportParams(search: Record<string, string | string[] | undefined>) {
  const scope = await loadDocsScope(search);
  const kind: DocReportKind = isDocReportKind(one(search.kind)) ? (one(search.kind) as DocReportKind) : "register";
  const today = bkkDate(new Date());
  const thisYear = currentYearBe();
  const wantYear = Number(one(search.year));
  const year = Number.isInteger(wantYear) && wantYear >= 2500 && wantYear <= thisYear ? wantYear : thisYear;
  const wantMonth = Number(one(search.month));
  const month = Number.isInteger(wantMonth) && wantMonth >= 1 && wantMonth <= 12 ? wantMonth : Number(today.slice(5, 7));
  const direction: "receive" | "send" = one(search.dir) === "send" ? "send" : "receive";
  const currentFy = fiscalYearOf(today);
  const wantFy = Number(one(search.fy));
  const fiscalYear = Number.isInteger(wantFy) && wantFy >= 2500 && wantFy <= currentFy ? wantFy : currentFy;
  const query = (extra: Record<string, string | number | null> = {}) =>
    docsQuery(scope.unit?.id, { kind, dir: direction, year, month, fy: fiscalYear, ...extra });
  return { ...scope, kind, year, month, direction, fiscalYear, currentFy, thisYear, query };
}
