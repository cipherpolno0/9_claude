import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isUuid } from "@/lib/budget";
import { fetchItemDetail, fetchLedger } from "@/lib/budget-server";

import { loadBudgetScope } from "../../../../../scope";
import { LedgerPrint } from "./ledger-print";

export const metadata: Metadata = { title: "พิมพ์ทะเบียนคุมงบประมาณ" };
export const dynamic = "force-dynamic";

export default async function LedgerPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { unit } = await loadBudgetScope(await searchParams);
  if (!unit) notFound();
  const item = await fetchItemDetail(id, unit.id);
  if (!item || item.kind !== "category") notFound();
  const rows = await fetchLedger(item.id, unit.id);
  if (!rows) notFound();
  return (
    <LedgerPrint
      title={`ทะเบียนคุมงบประมาณ ปีงบประมาณ ${item.year_be}`}
      subtitle={item.path}
      unitName={unit.name}
      rows={rows}
    />
  );
}
