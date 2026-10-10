"use client";

import { PrintPage, useDigits } from "@/components/print/print-page";
import type { CardRow } from "@/lib/inventory";

import { CardTable } from "../card-table";

function Body({ rows, unit }: { rows: CardRow[]; unit: string }) {
  const d = useDigits();
  return rows.length === 0 ? <p>ยังไม่มีความเคลื่อนไหว</p> : <CardTable rows={rows} unit={unit} d={(s) => d(s)} links={false} />;
}

export function CardPrint({ title, subtitle, unitName, unit, rows }: { title: string; subtitle: string; unitName: string; unit: string; rows: CardRow[] }) {
  return (
    <PrintPage title={title} subtitle={subtitle} unitName={unitName}>
      <Body rows={rows} unit={unit} />
    </PrintPage>
  );
}
