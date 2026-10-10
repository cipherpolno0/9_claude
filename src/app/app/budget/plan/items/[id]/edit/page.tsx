import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { KIND_LABEL, isUuid } from "@/lib/budget";
import { fetchBudgetOptions, fetchItemDetail } from "@/lib/budget-server";

import { budgetQuery, loadBudgetScope } from "../../../../scope";
import { ItemForm } from "../../item-form";

export const metadata: Metadata = { title: "แก้ไขรายการงบประมาณ" };
export const dynamic = "force-dynamic";

export default async function EditItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const search = await searchParams;
  const { year, unit } = await loadBudgetScope(search);
  if (!unit) notFound();
  const item = await fetchItemDetail(id, unit.id);
  if (!item) notFound();
  const query = budgetQuery(year, unit);
  const back = `/app/budget/plan/items/${item.id}?${query}`;
  const blocked = !item.owned || !item.can_edit_item
    ? "แก้ไขได้เฉพาะเจ้าหน้าที่ของหน่วยเจ้าของงบที่มีสิทธิ์แก้ไข"
    : !item.year_open
      ? `ปีงบประมาณ ${item.year_be} ปิดแล้ว`
      : !item.is_active
        ? "รายการนี้ถูกปิดใช้งานแล้ว"
        : null;
  const { categories, sources } = await fetchBudgetOptions();

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={back} className="text-primary underline underline-offset-4">
          ← {item.label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">แก้ไข{KIND_LABEL[item.kind]}</h1>
      <p className="mt-1 text-muted-foreground">{item.path}</p>
      {blocked ? (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-5">
          {blocked}
        </p>
      ) : (
        <ItemForm
          id={item.id}
          kind={item.kind}
          yearId={item.fiscal_year_id}
          unitId={item.owner_unit_id}
          parentId={item.parent_id}
          query={query}
          backHref={back}
          categories={categories}
          sources={sources}
          amountLocked={item.has_allocations}
          initial={{
            name: item.name,
            code: item.code,
            category: item.category_id ?? "",
            source: item.source_id ?? "",
            amount: item.amount != null ? String(item.amount) : "",
            note: item.note,
          }}
        />
      )}
    </section>
  );
}
