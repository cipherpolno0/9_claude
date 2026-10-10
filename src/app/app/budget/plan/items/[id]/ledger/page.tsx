import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSpreadsheet, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isUuid } from "@/lib/budget";
import { fetchItemDetail, fetchLedger } from "@/lib/budget-server";

import { budgetQuery, loadBudgetScope } from "../../../../scope";
import { LedgerTable } from "./ledger-table";

export const metadata: Metadata = { title: "ทะเบียนคุมงบประมาณ" };
export const dynamic = "force-dynamic";

export default async function LedgerPage({
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
  const query = budgetQuery(null, unit, { year: String(item.year_be) });

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={`/app/budget/plan/items/${item.id}?${query}`} className="text-primary underline underline-offset-4">
          ← {item.label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ทะเบียนคุมงบประมาณ</h1>
      <p className="mt-1 text-muted-foreground" data-testid="ledger-head">
        {item.path} · {unit.name} · ปีงบประมาณ {item.year_be}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        คงเหลือ = ได้รับจัดสรร - จัดสรรต่อ - ผูกพัน (เงินถูกกันเมื่ออนุมัติคำขอใช้งบ การเบิกจ่ายลดยอดค้างเบิก ไม่หักคงเหลือซ้ำ)
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/app/budget/plan/items/${item.id}/ledger/print?${query}`} prefetch={false} target="_blank">
            <Printer aria-hidden />
            พิมพ์
          </Link>
        </Button>
        <Button asChild variant="outline">
          <a href={`/app/budget/plan/items/${item.id}/ledger/export?${query}`}>
            <FileSpreadsheet aria-hidden />
            ส่งออก Excel
          </a>
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground">ยังไม่มีรายการเคลื่อนไหว</p>
      ) : (
        <div className="relative mt-6 overflow-x-auto rounded-xl border bg-card">
          <LedgerTable rows={rows} />
        </div>
      )}
    </section>
  );
}
