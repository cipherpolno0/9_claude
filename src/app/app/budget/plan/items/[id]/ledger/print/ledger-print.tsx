"use client";

import { PrintPage, useDigits } from "@/components/print/print-page";
import type { LedgerRow } from "@/lib/budget";

import { LedgerTable } from "../ledger-table";

function Body({ rows }: { rows: LedgerRow[] }) {
  const d = useDigits();
  return rows.length === 0 ? <p>ยังไม่มีรายการเคลื่อนไหว</p> : <LedgerTable rows={rows} d={(s) => d(s)} />;
}

export function LedgerPrint({ title, subtitle, unitName, rows }: { title: string; subtitle: string; unitName: string; rows: LedgerRow[] }) {
  return (
    <PrintPage title={title} subtitle={subtitle} unitName={unitName} orientation="landscape">
      <Body rows={rows} />
    </PrintPage>
  );
}
