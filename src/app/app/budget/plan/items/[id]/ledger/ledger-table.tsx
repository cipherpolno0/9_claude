import { LEDGER_KIND_LABEL, baht, sumMoney, type LedgerRow } from "@/lib/budget";
import { thaiDate } from "@/lib/thai";

/** สรุปท้ายทะเบียนคุม */
export function ledgerTotals(rows: LedgerRow[]) {
  const last = rows[rows.length - 1];
  return {
    received: sumMoney(rows.map((r) => r.received)),
    committed: sumMoney(rows.map((r) => r.committed)),
    disbursed: sumMoney(rows.map((r) => r.disbursed)),
    balance: Number(last?.balance ?? 0),
    outstanding: Number(last?.outstanding ?? 0),
  };
}

const money = (v: number | string, d: (s: string) => string) => (Number(v) === 0 ? "" : d(baht(v)));

/**
 * ตารางทะเบียนคุมงบประมาณ (ใช้ทั้งหน้าจอและหน้าพิมพ์ ไม่มี hook: หน้าพิมพ์ส่งตัวแปลงเลข d มาให้)
 * คงเหลือ = ยอดสะสมของ (ได้รับจัดสรร - ผูกพัน) / ค้างเบิก = ยอดสะสมของ (ผูกพัน - เบิกจ่าย)
 */
export function LedgerTable({ rows, d = (s) => s }: { rows: LedgerRow[]; d?: (s: string) => string }) {
  const t = ledgerTotals(rows);
  return (
    <table className="w-full min-w-[920px] border-collapse text-left text-sm print:min-w-0 print:text-[11px]" data-testid="ledger-table">
      <thead className="bg-secondary print:bg-transparent">
        <tr>
          <th scope="col" className="border px-2 py-1">วันที่</th>
          <th scope="col" className="border px-2 py-1">รายการ</th>
          <th scope="col" className="border px-2 py-1">อ้างอิง</th>
          <th scope="col" className="border px-2 py-1 text-right">ได้รับจัดสรร</th>
          <th scope="col" className="border px-2 py-1 text-right">ผูกพัน</th>
          <th scope="col" className="border px-2 py-1 text-right">เบิกจ่าย</th>
          <th scope="col" className="border px-2 py-1 text-right">คงเหลือ</th>
          <th scope="col" className="border px-2 py-1 text-right">ค้างเบิก</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="align-top" data-testid="ledger-row" data-kind={r.kind}>
            <td className="border px-2 py-1 whitespace-nowrap">{d(thaiDate(r.happened_on, "short"))}</td>
            <td className="border px-2 py-1">
              <span className="text-muted-foreground">{LEDGER_KIND_LABEL[r.kind] ?? r.kind}:</span> {d(r.description)}
            </td>
            <td className="border px-2 py-1">{d(r.ref_no)}</td>
            <td className="border px-2 py-1 text-right tabular-nums">{money(r.received, d)}</td>
            <td className="border px-2 py-1 text-right tabular-nums">{money(r.committed, d)}</td>
            <td className="border px-2 py-1 text-right tabular-nums">{money(r.disbursed, d)}</td>
            <td className="border px-2 py-1 text-right tabular-nums">{d(baht(r.balance))}</td>
            <td className="border px-2 py-1 text-right tabular-nums">{d(baht(r.outstanding))}</td>
          </tr>
        ))}
        <tr className="font-semibold" data-testid="ledger-total">
          <td className="border px-2 py-1" colSpan={3}>
            รวม
          </td>
          <td className="border px-2 py-1 text-right tabular-nums">{d(baht(t.received))}</td>
          <td className="border px-2 py-1 text-right tabular-nums">{d(baht(t.committed))}</td>
          <td className="border px-2 py-1 text-right tabular-nums">{d(baht(t.disbursed))}</td>
          <td className="border px-2 py-1 text-right tabular-nums">{d(baht(t.balance))}</td>
          <td className="border px-2 py-1 text-right tabular-nums">{d(baht(t.outstanding))}</td>
        </tr>
      </tbody>
    </table>
  );
}
