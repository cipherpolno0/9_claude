import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { baht, isUuid } from "@/lib/budget";
import { fetchAllocationRows, fetchItemDetail } from "@/lib/budget-server";
import { todayInBangkok } from "@/lib/venues";

import { searchRecipients } from "../../../../actions";
import { budgetQuery, loadBudgetScope } from "../../../../scope";
import { AllocateForm, type ReduceTarget } from "./allocate-form";

export const metadata: Metadata = { title: "จัดสรรงบประมาณ" };
export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = { region: "ภาค", province: "จังหวัด", district: "อำเภอ", subdistrict: "ตำบล" };

export default async function AllocatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const search = await searchParams;
  const { units, unit } = await loadBudgetScope(search);
  if (!unit) notFound();
  const item = await fetchItemDetail(id, unit.id);
  if (!item || item.kind !== "category") notFound();
  const query = budgetQuery(null, unit, { year: String(item.year_be) });
  const back = `/app/budget/plan/items/${item.id}?${query}`;
  const rows = await fetchAllocationRows(item.id, unit.id);
  const out = rows.filter((r) => r.direction === "out" && r.is_active);
  const nextRound = Math.min(999, out.reduce((m, r) => Math.max(m, r.round_no), 0) + 1);

  // ยอดสุทธิต่อผู้รับ (ใช้เลือกผู้รับที่จะปรับลด)
  const totals = new Map<string, ReduceTarget>();
  for (const r of out) {
    const key = r.to_unit_id ? `unit:${r.to_unit_id}` : `place:${r.to_place_id}`;
    const t = totals.get(key) ?? { key, name: r.to_name, total: 0 };
    t.total = Math.round((t.total + Number(r.amount)) * 100) / 100;
    totals.set(key, t);
  }
  const reduceTargets = [...totals.values()].filter((t) => t.total > 0);
  const quickPicks = units
    .filter((u) => u.parent_id === unit.id && u.is_active)
    .map((u) => ({
      id: `unit:${u.id}`,
      label: u.name,
      detail: LEVEL_LABEL[u.level] ?? "",
      data: { kind: "unit" as const, id: u.id, name: u.name, code: u.code, detail: LEVEL_LABEL[u.level] ?? "" },
    }));
  const blocked = !item.can_edit_unit
    ? "ท่านไม่มีสิทธิ์จัดสรรงบประมาณของหน่วยนี้"
    : !item.year_open
      ? `ปีงบประมาณ ${item.year_be} ปิดแล้ว`
      : !item.is_active
        ? "รายการนี้ถูกปิดใช้งานแล้ว"
        : Number(item.remaining) <= 0 && reduceTargets.length === 0
          ? "ไม่มียอดคงเหลือให้จัดสรร"
          : null;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={back} className="text-primary underline underline-offset-4">
          ← {item.label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">จัดสรรงบประมาณ</h1>
      <p className="mt-1 text-muted-foreground">{item.path}</p>
      <p className="mt-1">
        หน่วยที่จัดสรร: <span className="font-semibold">{unit.name}</span> · วงเงิน {baht(item.received)} · จัดสรรแล้ว{" "}
        {baht(item.allocated)} · <span className="font-semibold">คงเหลือ {baht(item.remaining)} บาท</span>
      </p>
      {blocked ? (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-5">
          {blocked}
        </p>
      ) : (
        <AllocateForm
          itemId={item.id}
          unitId={unit.id}
          remaining={Number(item.remaining)}
          nextRound={nextRound}
          today={todayInBangkok()}
          quickPicks={quickPicks}
          reduceTargets={reduceTargets}
          backHref={back}
          search={searchRecipients.bind(null, unit.id)}
        />
      )}
    </section>
  );
}
