import type { Metadata } from "next";
import Link from "next/link";

import { isUuid } from "@/lib/budget";
import { fetchBudgetTree } from "@/lib/budget-server";

import { budgetQuery, loadBudgetScope } from "../../scope";
import { heldCategories } from "../items";
import { UseForm } from "../use-form";

export const metadata: Metadata = { title: "ยื่นคำขอใช้งบประมาณ" };
export const dynamic = "force-dynamic";

export default async function NewUsePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { year, unit, unitEditable } = await loadBudgetScope(search);
  const q = budgetQuery(year, unit);
  const rows = year && unit && unitEditable ? await fetchBudgetTree(year.id, unit.id) : [];
  const items = heldCategories(rows).filter((i) => i.free > 0);
  const blocked = !year || !unit
    ? "ไม่พบปีงบประมาณหรือหน่วย"
    : !unitEditable
      ? "ท่านไม่มีสิทธิ์ขอใช้งบประมาณของหน่วยนี้"
      : year.status !== "open"
        ? `ปีงบประมาณ ${year.year_be} ปิดแล้ว`
        : items.length === 0
          ? "หน่วยนี้ยังไม่มีหมวดรายจ่ายที่มียอดคงเหลือให้ขอใช้"
          : null;

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={`/app/budget/uses?${q}`} className="text-primary underline underline-offset-4">
          ← คำขอใช้งบประมาณ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ยื่นคำขอใช้งบประมาณ</h1>
      <p className="mt-1 text-muted-foreground">
        {unit ? `หน่วยที่ใช้เงิน: ${unit.name}` : ""} {year ? `· ปีงบประมาณ ${year.year_be}` : ""}
      </p>
      {blocked ? (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-5">
          {blocked}
        </p>
      ) : (
        <UseForm
          items={items}
          unitId={unit!.id}
          initialItem={isUuid(search.item) && items.some((i) => i.id === search.item) ? search.item : ""}
          query={q}
        />
      )}
    </section>
  );
}
