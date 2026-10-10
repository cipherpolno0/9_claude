import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isUuid } from "@/lib/budget";
import { fetchStock, fetchStockCard } from "@/lib/inventory-server";

import { loadInventory } from "../../scope";
import { CardPrint } from "./card-print";

export const metadata: Metadata = { title: "พิมพ์ Stock Card" };
export const dynamic = "force-dynamic";

export default async function CardPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const { warehouse } = await loadInventory(search);
  const itemId = typeof search.item === "string" && isUuid(search.item) ? search.item : null;
  if (!warehouse || !itemId) notFound();
  const item = (await fetchStock(warehouse.id)).find((s) => s.item_id === itemId);
  const rows = item ? await fetchStockCard(warehouse.id, item.item_id) : null;
  if (!item || !rows) notFound();
  return (
    <CardPrint
      title={`บัญชีวัสดุ (Stock Card) ${item.code} ${item.name}`}
      subtitle={`${warehouse.name} · หน่วยนับ ${item.unit}`}
      unitName={warehouse.unit_name}
      unit={item.unit}
      rows={rows}
    />
  );
}
