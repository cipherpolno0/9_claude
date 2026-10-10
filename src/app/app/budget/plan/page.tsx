import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileSpreadsheet, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FISCAL_STATUS_LABEL, KIND_LABEL, PLAN_IMPORT_HEADERS, baht, buildBudgetTree, flattenTree, treeSpend, treeTotals } from "@/lib/budget";
import { fetchBudgetTree, fetchSpendSummary } from "@/lib/budget-server";
import { thaiDate } from "@/lib/thai";

import { UnitFilter } from "../../personnel/unit-filter";
import { confirmPlanImport, previewPlanImport } from "../actions";
import { budgetQuery, loadBudgetScope } from "../scope";
import { PlanImportButton } from "./import-button";
import { YearSelect } from "./year-select";

export const metadata: Metadata = { title: "แผนงบประมาณและการจัดสรร" };
export const dynamic = "force-dynamic";

/** ต้นไม้งบประมาณของหน่วยที่เลือก: รายการที่หน่วยเป็นเจ้าของ + รายการที่ได้รับจัดสรรจากหน่วยเหนือ */
export default async function BudgetPlanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { ctx, years, year, units, unit, unitEditable } = await loadBudgetScope(search);
  const showInactive = search.inactive === "1";
  const [rows, summary] = year && unit
    ? await Promise.all([fetchBudgetTree(year.id, unit.id, showInactive), fetchSpendSummary(year.id, unit.id)])
    : [[], new Map()];
  const tree = buildBudgetTree(rows);
  const spend = treeSpend(tree, summary);
  const flat = flattenTree(tree);
  const totals = treeTotals(tree.filter((n) => n.is_active));
  const canEdit = Boolean(year && unit && unitEditable && year.status === "open");
  const q = budgetQuery(year, unit);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/budget" className="text-primary underline underline-offset-4">
          งบประมาณ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">แผนงบประมาณและการจัดสรร</h1>
      <p className="mt-1 text-muted-foreground">
        วงเงิน = ยอดที่หน่วยได้รับ (หน่วยเจ้าของงบ = วงเงินของรายการ / หน่วยอื่น = ยอดที่หน่วยเหนือจัดสรรลงมา) · จัดสรรแล้ว = ยอดที่หน่วยนี้จัดสรรต่อลงล่าง ·
        ผูกพัน = คำขอใช้งบที่อนุมัติแล้ว (หักคืนเงินเหลือจ่าย) · คงเหลือ = วงเงิน - จัดสรรแล้ว - ผูกพัน
      </p>

      {years.length === 0 ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground" data-testid="budget-no-year">
          ยังไม่มีปีงบประมาณในระบบ
          {ctx.isAdmin ? (
            <>
              {" "}
              เพิ่มได้ที่{" "}
              <Link href="/app/budget/settings" className="text-primary underline underline-offset-4">
                ตั้งค่างบประมาณ
              </Link>
            </>
          ) : " กรุณาติดต่อผู้ดูแลระบบ"}
        </p>
      ) : !unit ? (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-5" data-testid="budget-denied">
          บทบาทของท่านยังไม่มีสิทธิ์ดูงบประมาณของหน่วยใด
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_2fr]">
            <YearSelect years={years} value={year?.year_be ?? null} unitId={unit.id} />
            <UnitFilter units={units} value={unit.id} param="unit" allowClear={false} applyLabel="ดูงบของหน่วยนี้" />
          </div>

          {year ? (
            <p className="text-muted-foreground" data-testid="year-status">
              ปีงบประมาณ {year.year_be} ({thaiDate(year.starts_on, "short")} – {thaiDate(year.ends_on, "short")}) สถานะ:{" "}
              <span className={year.status === "open" ? "font-semibold text-green-800" : "font-semibold text-destructive"}>
                {FISCAL_STATUS_LABEL[year.status]}
              </span>
              {year.status === "closed" ? " (ดูได้อย่างเดียว แก้ไข จัดสรร และโอนไม่ได้)" : ""}
            </p>
          ) : null}

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="budget-totals">
            {[
              { k: "วงเงินที่ได้รับ", v: totals.received },
              { k: "จัดสรรแล้ว", v: totals.allocated },
              { k: "ผูกพัน", v: spend.total.committed },
              { k: "เบิกจ่ายแล้ว", v: spend.total.disbursed },
              { k: "คงเหลือ", v: totals.remaining },
            ].map((t) => (
              <div key={t.k} className="rounded-xl border bg-card p-4">
                <dt className="text-sm text-muted-foreground">{t.k}</dt>
                <dd className="text-2xl font-bold text-primary tabular-nums">{baht(t.v)}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <>
                <Button asChild>
                  <Link href={`/app/budget/plan/items/new?${budgetQuery(year, unit, { kind: "program" })}`} prefetch={false}>
                    <Plus aria-hidden />
                    เพิ่มแผนงาน
                  </Link>
                </Button>
                <PlanImportButton
                  columns={PLAN_IMPORT_HEADERS.slice(0, 5)}
                  preview={previewPlanImport.bind(null, year!.id, unit.id)}
                  confirm={confirmPlanImport.bind(null, year!.id, unit.id)}
                />
                <Button asChild variant="outline">
                  <a href={`/app/budget/plan/template?${q}`}>
                    <FileSpreadsheet aria-hidden />
                    แม่แบบนำเข้า
                  </a>
                </Button>
              </>
            ) : null}
            <Button asChild variant="outline">
              <a href={`/app/budget/plan/export?${q}`}>
                <Download aria-hidden />
                ส่งออก Excel
              </a>
            </Button>
            <Link
              href={`/app/budget/plan?${budgetQuery(year, unit, showInactive ? {} : { inactive: "1" })}`}
              className="ml-auto text-primary underline underline-offset-4"
              prefetch={false}
            >
              {showInactive ? "ซ่อนรายการที่ปิดใช้งาน" : "แสดงรายการที่ปิดใช้งานด้วย"}
            </Link>
          </div>

          {flat.length === 0 ? (
            <p className="rounded-xl border bg-card p-5 text-muted-foreground" data-testid="budget-empty">
              หน่วยนี้ยังไม่มีรายการงบประมาณของปี {year?.year_be}
              {canEdit ? " เริ่มได้ที่ปุ่ม เพิ่มแผนงาน หรือ นำเข้าจาก Excel" : ""}
            </p>
          ) : (
            <div className="relative overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[900px] border-collapse text-left" data-testid="budget-tree">
                <caption className="sr-only">ต้นไม้งบประมาณของ {unit.name} ปีงบประมาณ {year?.year_be}</caption>
                <thead className="bg-secondary">
                  <tr>
                    <th scope="col" className="px-3 py-2">รายการ</th>
                    <th scope="col" className="px-3 py-2 text-right">วงเงิน (บาท)</th>
                    <th scope="col" className="px-3 py-2 text-right">จัดสรรแล้ว</th>
                    <th scope="col" className="px-3 py-2 text-right">ผูกพัน</th>
                    <th scope="col" className="px-3 py-2 text-right">เบิกจ่าย</th>
                    <th scope="col" className="px-3 py-2 text-right">คงเหลือ</th>
                    <th scope="col" className="px-3 py-2">
                      <span className="sr-only">ทำรายการ</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {flat.map((n) => {
                    const childKind = n.kind === "program" ? "project" : n.kind === "project" ? "category" : null;
                    return (
                      <tr
                        key={n.id}
                        className={`border-t ${n.kind === "program" ? "bg-secondary/40 font-semibold" : ""} ${n.is_active ? "" : "text-muted-foreground line-through"}`}
                        data-testid="budget-row"
                        data-kind={n.kind}
                        data-label={n.label}
                      >
                        <td className="px-3 py-2" style={{ paddingLeft: `${0.75 + n.depth * 1.5}rem` }}>
                          <span className="mr-2 rounded border px-1.5 py-0.5 text-xs font-normal text-muted-foreground no-underline">
                            {KIND_LABEL[n.kind]}
                          </span>
                          <Link
                            href={`/app/budget/plan/items/${n.id}?${q}`}
                            prefetch={false}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {n.code ? `${n.code} ` : ""}
                            {n.label}
                          </Link>
                          {!n.owned && n.kind === "program" ? (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">(งบของ {n.owner_unit_name})</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{baht(n.received)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{baht(n.allocated)}</td>
                        <td className="px-3 py-2 text-right tabular-nums" data-col="committed">{baht(spend.byId.get(n.id)?.committed ?? 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums" data-col="disbursed">{baht(spend.byId.get(n.id)?.disbursed ?? 0)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${Number(n.remaining) < 0 ? "text-destructive" : ""}`}>
                          {baht(n.remaining)}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {canEdit && n.owned && n.is_active && childKind ? (
                            <Link
                              href={`/app/budget/plan/items/new?${budgetQuery(year, unit, { kind: childKind, parent: n.id })}`}
                              prefetch={false}
                              className="whitespace-nowrap text-primary underline underline-offset-4"
                            >
                              + {KIND_LABEL[childKind]}
                            </Link>
                          ) : null}
                          {canEdit && n.kind === "category" && n.is_active && Number(n.remaining) > 0 ? (
                            <Link
                              href={`/app/budget/plan/items/${n.id}/allocate?${q}`}
                              prefetch={false}
                              className="whitespace-nowrap text-primary underline underline-offset-4"
                            >
                              จัดสรร
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
