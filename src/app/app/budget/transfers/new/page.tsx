import type { Metadata } from "next";
import Link from "next/link";

import { isUuid } from "@/lib/budget";
import { fetchBudgetTree } from "@/lib/budget-server";

import { budgetQuery, loadBudgetScope } from "../../scope";
import { TransferForm } from "../transfer-form";

export const metadata: Metadata = { title: "ยื่นคำขอโอนเปลี่ยนแปลง" };
export const dynamic = "force-dynamic";

export default async function NewTransferPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { year, unit, unitEditable } = await loadBudgetScope(search);
  const q = budgetQuery(year, unit);
  const rows = year && unit && unitEditable ? await fetchBudgetTree(year.id, unit.id) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pathOf = (id: string | null): string => {
    const r = id ? byId.get(id) : undefined;
    return r ? [pathOf(r.parent_id), r.label].filter(Boolean).join(" > ") : "";
  };
  const items = rows
    .filter((r) => r.kind === "category" && r.owned && r.is_active)
    .map((r) => ({ id: r.id, path: pathOf(r.id), amount: Number(r.received), free: Number(r.remaining) }));
  const blocked = !year || !unit
    ? "ไม่พบปีงบประมาณหรือหน่วย"
    : !unitEditable
      ? "ท่านไม่มีสิทธิ์ยื่นคำขอโอนงบประมาณของหน่วยนี้"
      : year.status !== "open"
        ? `ปีงบประมาณ ${year.year_be} ปิดแล้ว`
        : items.length < 2
          ? "ต้องมีหมวดรายจ่ายของหน่วยนี้อย่างน้อย 2 รายการจึงโอนระหว่างกันได้"
          : null;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={`/app/budget/transfers?${q}`} className="text-primary underline underline-offset-4">
          ← คำขอโอนเปลี่ยนแปลง
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ยื่นคำขอโอนเปลี่ยนแปลงงบประมาณ</h1>
      <p className="mt-1 text-muted-foreground">
        {unit ? `หน่วยเจ้าของงบ: ${unit.name}` : ""} {year ? `· ปีงบประมาณ ${year.year_be}` : ""} · โอนได้เฉพาะยอดที่ยังไม่จัดสรรของรายการต้นทาง
      </p>
      {blocked ? (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-5">
          {blocked}
        </p>
      ) : (
        <TransferForm items={items} initialFrom={isUuid(search.from) && items.some((i) => i.id === search.from) ? search.from : ""} query={q} />
      )}
    </section>
  );
}
