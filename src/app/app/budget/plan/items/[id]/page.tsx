import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Pencil, Plus, Send } from "lucide-react";

import { InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  CHANGE_ACTION_LABEL,
  KIND_LABEL,
  TRANSFER_STATUS_CLASS,
  TRANSFER_STATUS_LABEL,
  baht,
  buildBudgetTree,
  flattenTree,
  isUuid,
  type AllocationRow,
} from "@/lib/budget";
import { fetchAllocationRows, fetchBudgetTree, fetchItemDetail, fetchItemHistory, fetchTransferRows } from "@/lib/budget-server";
import { thaiDate, thaiDateTime } from "@/lib/thai";

import { budgetQuery, loadBudgetScope } from "../../../scope";
import { ActiveToggle, CancelAllocationButton } from "./item-actions";

export const metadata: Metadata = { title: "รายการงบประมาณ" };
export const dynamic = "force-dynamic";

const DETAIL_LABEL: Record<string, string> = { name: "ชื่อ", code: "รหัส", category: "หมวดรายจ่าย", source: "แหล่งเงิน", note: "หมายเหตุ" };

function changeText(detail: Record<string, unknown>) {
  return Object.entries(detail)
    .filter(([k]) => k in DETAIL_LABEL)
    .map(([k, v]) => {
      const x = v as { from?: string; to?: string };
      return `${DETAIL_LABEL[k]}: ${x.from || "-"} > ${x.to || "-"}`;
    })
    .join(" · ");
}

function AllocationTable({ rows, direction, canCancel }: { rows: AllocationRow[]; direction: "out" | "in"; canCancel: boolean }) {
  if (rows.length === 0) {
    return <p className="mt-2 text-muted-foreground">{direction === "out" ? "ยังไม่ได้จัดสรร" : "ไม่มี"}</p>;
  }
  return (
    <div className="relative mt-2 overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left" data-testid={`alloc-${direction}`}>
        <thead className="bg-secondary">
          <tr>
            <th scope="col" className="px-3 py-2">ครั้งที่</th>
            <th scope="col" className="px-3 py-2">วันที่</th>
            <th scope="col" className="px-3 py-2">{direction === "out" ? "ผู้รับ" : "จาก"}</th>
            <th scope="col" className="px-3 py-2 text-right">จำนวนเงิน (บาท)</th>
            {direction === "out" ? <th scope="col" className="px-3 py-2 text-right">ผู้รับจัดสรรต่อแล้ว</th> : null}
            <th scope="col" className="px-3 py-2">เอกสารอ้างอิง / หมายเหตุ</th>
            {canCancel ? (
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">ทำรายการ</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-t align-top ${r.is_active ? "" : "text-muted-foreground"}`} data-testid="alloc-row" data-active={r.is_active ? "1" : "0"}>
              <td className="px-3 py-2">{r.round_no}</td>
              <td className="px-3 py-2 whitespace-nowrap">{thaiDate(r.allocated_on, "short")}</td>
              <td className="px-3 py-2">
                {direction === "out" ? r.to_name : r.from_name}
                {direction === "out" && r.to_detail ? <span className="block text-sm text-muted-foreground">{r.to_detail}</span> : null}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${r.is_active ? "" : "line-through"}`}>
                {Number(r.amount) < 0 ? "ปรับลด " : ""}
                {baht(r.amount)}
              </td>
              {direction === "out" ? (
                <td className="px-3 py-2 text-right tabular-nums">{r.passed_on != null ? baht(r.passed_on) : "-"}</td>
              ) : null}
              <td className="px-3 py-2">
                {[r.reference_no, r.note].filter(Boolean).join(" · ") || "-"}
                {!r.is_active ? (
                  <span className="block text-sm">
                    ยกเลิกแล้ว {thaiDate(r.cancelled_at, "short")}: {r.cancel_reason}
                  </span>
                ) : null}
              </td>
              {canCancel ? <td className="px-3 py-2">{r.is_active ? <CancelAllocationButton id={r.id} /> : null}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function BudgetItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const search = await searchParams;
  const { unit } = await loadBudgetScope(search);
  if (!unit) notFound();
  const item = await fetchItemDetail(id, unit.id);
  if (!item) notFound();
  const qx = (extra: Record<string, string> = {}) => budgetQuery(null, unit, { year: String(item.year_be), ...extra });
  const query = qx();
  const saved = typeof search.saved === "string" ? search.saved : null;
  const open = item.year_open;
  const editableHere = item.can_edit_unit && open && item.is_active;
  const ownerEdit = item.owned && item.can_edit_item && open;

  const [rows, history, children, transfers] = await Promise.all([
    item.kind === "category" ? fetchAllocationRows(item.id, unit.id) : Promise.resolve([]),
    fetchItemHistory(item.id),
    item.kind !== "category" ? fetchBudgetTree(item.fiscal_year_id, unit.id, item.owned) : Promise.resolve([]),
    item.kind === "category" && item.owned ? fetchTransferRows(item.fiscal_year_id, unit.id) : Promise.resolve([]),
  ]);
  const childRows = item.kind !== "category" ? flattenTree(buildBudgetTree(children)).filter((n) => n.parent_id === item.id) : [];
  const itemTransfers = transfers.filter((t) => t.from_item_id === item.id || t.to_item_id === item.id);
  const out = rows.filter((r) => r.direction === "out");
  const incoming = rows.filter((r) => r.direction === "in");
  const childKind = item.kind === "program" ? "project" : item.kind === "project" ? "category" : null;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={`/app/budget/plan?${query}`} className="text-primary underline underline-offset-4">
          ← แผนงบประมาณ {unit.name} ปี {item.year_be}
        </Link>
      </p>
      <p className="mt-2 text-sm text-muted-foreground" data-testid="item-path">
        {item.path}
      </p>
      <h1 className="mt-1 text-2xl font-bold text-primary sm:text-3xl">
        {KIND_LABEL[item.kind]}: {item.code ? `${item.code} ` : ""}
        {item.label}
      </h1>
      <p className="mt-1 text-muted-foreground">
        หน่วยเจ้าของงบ: {item.owner_unit_name}
        {item.owned ? "" : ` · หน่วยที่ดู: ${unit.name} (ได้รับจัดสรร)`}
        {item.note ? ` · หมายเหตุ: ${item.note}` : ""}
        {item.is_active ? "" : " · ปิดใช้งานแล้ว"}
      </p>
      {saved ? (
        <div className="mt-4">
          <InfoText>{saved}</InfoText>
        </div>
      ) : null}

      <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="item-totals">
        {[
          { k: item.owned ? "วงเงิน" : "วงเงินที่ได้รับจัดสรร", v: item.received },
          { k: "จัดสรรแล้ว", v: item.allocated },
          { k: "คงเหลือ", v: item.remaining },
        ].map((t) => (
          <div key={t.k} className="rounded-xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{t.k}</dt>
            <dd className="text-2xl font-bold text-primary tabular-nums">{baht(t.v)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {ownerEdit && item.is_active ? (
          <Button asChild variant="outline">
            <Link href={`/app/budget/plan/items/${item.id}/edit?${query}`} prefetch={false}>
              <Pencil aria-hidden />
              แก้ไข
            </Link>
          </Button>
        ) : null}
        {ownerEdit && item.is_active && childKind ? (
          <Button asChild variant="outline">
            <Link href={`/app/budget/plan/items/new?${qx({ kind: childKind, parent: item.id })}`} prefetch={false}>
              <Plus aria-hidden />
              เพิ่ม{KIND_LABEL[childKind]}
            </Link>
          </Button>
        ) : null}
        {item.kind === "category" && editableHere && Number(item.remaining) > 0 ? (
          <Button asChild>
            <Link href={`/app/budget/plan/items/${item.id}/allocate?${query}`} prefetch={false}>
              <Send aria-hidden />
              จัดสรร / ปรับลด
            </Link>
          </Button>
        ) : item.kind === "category" && editableHere && out.some((r) => r.is_active) ? (
          <Button asChild variant="outline">
            <Link href={`/app/budget/plan/items/${item.id}/allocate?${query}`} prefetch={false}>
              ปรับลดการจัดสรร
            </Link>
          </Button>
        ) : null}
        {item.kind === "category" && ownerEdit && item.is_active ? (
          <Button asChild variant="outline">
            <Link href={`/app/budget/transfers/new?${qx({ from: item.id })}`} prefetch={false}>
              <ArrowLeftRight aria-hidden />
              ยื่นคำขอโอนเปลี่ยนแปลง
            </Link>
          </Button>
        ) : null}
      </div>
      {!open ? (
        <p className="mt-3 text-muted-foreground">ปีงบประมาณ {item.year_be} ปิดแล้ว ดูได้อย่างเดียว</p>
      ) : null}

      {item.kind !== "category" ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="text-xl font-bold text-primary">{childKind ? `${KIND_LABEL[childKind]}ภายใต้รายการนี้` : ""}</h2>
          {childRows.length === 0 ? (
            <p className="mt-2 text-muted-foreground">ยังไม่มี</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y" data-testid="item-children">
              {childRows.map((c) => (
                <li key={c.id} className={`flex flex-wrap items-baseline justify-between gap-2 py-2 ${c.is_active ? "" : "text-muted-foreground line-through"}`}>
                  <Link href={`/app/budget/plan/items/${c.id}?${query}`} prefetch={false} className="text-primary underline-offset-4 hover:underline">
                    {c.code ? `${c.code} ` : ""}
                    {c.label}
                  </Link>
                  <span className="tabular-nums">
                    {baht(c.received)} · จัดสรรแล้ว {baht(c.allocated)} · คงเหลือ {baht(c.remaining)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-xl border bg-card p-5">
            <h2 className="text-xl font-bold text-primary">การจัดสรรของ {unit.name}</h2>
            <p className="text-muted-foreground">จัดสรรให้หน่วยใต้สังกัด (ข้ามชั้นได้) หรือสำนักในเขต จำนวนติดลบ = ปรับลดครั้งก่อน</p>
            <AllocationTable rows={out} direction="out" canCancel={editableHere} />
          </div>
          {!item.owned ? (
            <div className="mt-6 rounded-xl border bg-card p-5">
              <h2 className="text-xl font-bold text-primary">ได้รับจัดสรรจากหน่วยเหนือ</h2>
              <AllocationTable rows={incoming} direction="in" canCancel={false} />
            </div>
          ) : null}
          {item.owned ? (
            <div className="mt-6 rounded-xl border bg-card p-5">
              <h2 className="text-xl font-bold text-primary">คำขอโอนเปลี่ยนแปลงของรายการนี้</h2>
              {itemTransfers.length === 0 ? (
                <p className="mt-2 text-muted-foreground">ไม่มี</p>
              ) : (
                <ul className="mt-2 flex flex-col divide-y" data-testid="item-transfers">
                  {itemTransfers.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className={`rounded border px-2 py-0.5 text-sm ${TRANSFER_STATUS_CLASS[t.status] ?? ""}`}>
                        {TRANSFER_STATUS_LABEL[t.status] ?? t.status}
                      </span>
                      <Link href={`/app/budget/transfers/${t.id}?${query}`} prefetch={false} className="text-primary underline underline-offset-4">
                        {t.request_no ?? "คำขอโอน"}
                      </Link>
                      <span>
                        {t.from_item_id === item.id ? "โอนออก" : "รับโอน"} {baht(t.amount)} บาท
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </>
      )}

      {history.length ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="text-xl font-bold text-primary">ประวัติของรายการ</h2>
          <ul className="mt-2 flex flex-col gap-1" data-testid="item-history">
            {history.map((h) => (
              <li key={h.id}>
                <span className="text-muted-foreground">{thaiDateTime(h.created_at)}</span> · {CHANGE_ACTION_LABEL[h.action] ?? h.action}
                {h.amount_before != null || h.amount_after != null
                  ? ` · วงเงิน ${baht(h.amount_before)} > ${baht(h.amount_after)}`
                  : ""}
                {changeText(h.detail) ? ` · ${changeText(h.detail)}` : ""}
                {typeof h.detail.request_no === "string" ? ` · ${h.detail.request_no}` : ""}
                {h.reason ? ` · ${h.reason}` : ""}
                {h.actor_name ? ` · ${h.actor_name}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ownerEdit ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="text-xl font-bold text-primary">{item.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</h2>
          <p className="mb-3 text-muted-foreground">
            ระบบไม่ลบรายการ ใช้การปิดใช้งานแทน (ปิดได้เมื่อไม่มีรายการย่อยที่ใช้งาน ไม่มีการจัดสรร และไม่มีคำขอโอนค้าง)
          </p>
          <ActiveToggle id={item.id} active={item.is_active} />
        </div>
      ) : null}
    </section>
  );
}
