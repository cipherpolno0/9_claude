import Link from "next/link";

import { baht } from "@/lib/budget";
import { MOVE_KIND_LABEL, qty, type CardRow } from "@/lib/inventory";
import { thaiDate } from "@/lib/thai";

const n = (v: number | string) => Number(v ?? 0);

/** รวมรับ รวมจ่าย และยอดคงเหลือสุดท้ายของ Stock Card */
export function cardTotals(rows: CardRow[]) {
  return {
    received: Math.round(rows.reduce((s, r) => s + n(r.received), 0) * 100) / 100,
    issued: Math.round(rows.reduce((s, r) => s + n(r.issued), 0) * 100) / 100,
    balance: n(rows.at(-1)?.balance ?? 0),
  };
}

function refHref(r: CardRow): string | null {
  if (r.receipt_id) return `/app/inventory/receipts/${r.receipt_id}`;
  if (r.requisition_id) return `/app/inventory/requisitions/${r.requisition_id}`;
  if (r.transfer_id) return `/app/inventory/transfers/${r.transfer_id}`;
  return null;
}

/**
 * Stock Card: วันที่ รับ จ่าย คงเหลือ (ใช้ทั้งหน้าจอและหน้าพิมพ์ ไม่มี hook: หน้าพิมพ์ส่งตัวแปลงเลข d และ links=false)
 */
export function CardTable({ rows, unit, d = (s) => s, links = true }: { rows: CardRow[]; unit: string; d?: (s: string) => string; links?: boolean }) {
  const t = cardTotals(rows);
  return (
    <table className="w-full min-w-[680px] border-collapse text-left text-sm print:min-w-0 print:text-[11px]" data-testid="card-table">
      <thead className="bg-secondary print:bg-transparent">
        <tr>
          <th scope="col" className="border px-2 py-1">วันที่</th>
          <th scope="col" className="border px-2 py-1">รายการ</th>
          <th scope="col" className="border px-2 py-1">เอกสารอ้างอิง</th>
          <th scope="col" className="border px-2 py-1 text-right">รับ</th>
          <th scope="col" className="border px-2 py-1 text-right">จ่าย</th>
          <th scope="col" className="border px-2 py-1 text-right">คงเหลือ ({unit})</th>
          <th scope="col" className="border px-2 py-1 text-right">ราคาต่อหน่วย</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const href = links ? refHref(r) : null;
          return (
            <tr key={r.id} className="align-top" data-testid="card-row" data-kind={r.kind}>
              <td className="border px-2 py-1 whitespace-nowrap">{d(thaiDate(r.moved_on, "short"))}</td>
              <td className="border px-2 py-1">
                <span className="text-muted-foreground">{MOVE_KIND_LABEL[r.kind] ?? r.kind}</span>
                {r.note ? `: ${d(r.note)}` : ""}
              </td>
              <td className="border px-2 py-1">
                {href && r.reference_no ? (
                  <Link href={href} prefetch={false} className="text-primary underline underline-offset-4">
                    {r.reference_no}
                  </Link>
                ) : (
                  d(r.reference_no || "-")
                )}
              </td>
              <td className="border px-2 py-1 text-right tabular-nums">{n(r.received) ? d(qty(r.received)) : ""}</td>
              <td className="border px-2 py-1 text-right tabular-nums">{n(r.issued) ? d(qty(r.issued)) : ""}</td>
              <td className="border px-2 py-1 text-right tabular-nums">{d(qty(r.balance))}</td>
              <td className="border px-2 py-1 text-right tabular-nums">{r.unit_price === null ? "" : d(baht(r.unit_price))}</td>
            </tr>
          );
        })}
        <tr className="font-semibold" data-testid="card-total">
          <td className="border px-2 py-1" colSpan={3}>
            รวม
          </td>
          <td className="border px-2 py-1 text-right tabular-nums">{d(qty(t.received))}</td>
          <td className="border px-2 py-1 text-right tabular-nums">{d(qty(t.issued))}</td>
          <td className="border px-2 py-1 text-right tabular-nums">{d(qty(t.balance))}</td>
          <td className="border px-2 py-1" />
        </tr>
      </tbody>
    </table>
  );
}
