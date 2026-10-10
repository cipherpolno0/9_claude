import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BUDGET_KINDS, KIND_LABEL, isUuid, type BudgetKind } from "@/lib/budget";
import { fetchBudgetOptions, fetchItemDetail } from "@/lib/budget-server";

import { budgetQuery, loadBudgetScope } from "../../../scope";
import { ItemForm } from "../item-form";

export const metadata: Metadata = { title: "เพิ่มรายการงบประมาณ" };
export const dynamic = "force-dynamic";

const PARENT_KIND: Record<BudgetKind, BudgetKind | null> = { program: null, project: "program", category: "project" };

export default async function NewItemPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { year, unit, unitEditable } = await loadBudgetScope(search);
  const kind = (BUDGET_KINDS as readonly string[]).includes(String(search.kind)) ? (search.kind as BudgetKind) : "program";
  if (!year || !unit) notFound();
  const query = budgetQuery(year, unit);
  const parentId = isUuid(search.parent) ? search.parent : null;
  const parent = parentId ? await fetchItemDetail(parentId, unit.id) : null;
  const needParent = PARENT_KIND[kind];
  const blocked = !unitEditable
    ? "ท่านไม่มีสิทธิ์แก้ไขงบประมาณของหน่วยนี้"
    : year.status !== "open"
      ? `ปีงบประมาณ ${year.year_be} ปิดแล้ว`
      : needParent && (!parent || parent.kind !== needParent || !parent.owned || !parent.is_active)
        ? `กรุณาเพิ่มจากหน้าของ${KIND_LABEL[needParent]}ที่หน่วยนี้เป็นเจ้าของ`
        : null;
  const { categories, sources } = await fetchBudgetOptions();

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={`/app/budget/plan?${query}`} className="text-primary underline underline-offset-4">
          ← แผนงบประมาณ {unit.name} ปี {year.year_be}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">เพิ่ม{KIND_LABEL[kind]}</h1>
      <p className="mt-1 text-muted-foreground">
        หน่วยเจ้าของงบ: {unit.name} · ปีงบประมาณ {year.year_be}
        {parent ? ` · อยู่ภายใต้: ${parent.path}` : ""}
      </p>
      {blocked ? (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-5">
          {blocked}
        </p>
      ) : (
        <ItemForm
          id={null}
          kind={kind}
          yearId={year.id}
          unitId={unit.id}
          parentId={parent?.id ?? null}
          query={query}
          backHref={parent ? `/app/budget/plan/items/${parent.id}?${query}` : `/app/budget/plan?${query}`}
          categories={categories.filter((c) => c.is_active)}
          sources={sources.filter((s) => s.is_active)}
          amountLocked={false}
          initial={{ name: "", code: "", category: "", source: "", amount: "", note: "" }}
        />
      )}
    </section>
  );
}
