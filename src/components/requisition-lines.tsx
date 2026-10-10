import { qty, type RequisitionLine } from "@/lib/inventory";
import { cn } from "@/lib/utils";

/**
 * รายการวัสดุของใบเบิก พร้อมยอดคงเหลือปัจจุบันของคลัง (หน้าใบเบิกและหน้าคำขอกลาง)
 * มือถือแสดงเป็นการ์ด จอใหญ่แสดงเป็นตาราง
 */
export function RequisitionLines({ lines, showBalance = true }: { lines: RequisitionLine[]; showBalance?: boolean }) {
  const hasApproved = lines.some((l) => l.approved !== undefined && l.approved !== null);
  const hasIssued = lines.some((l) => l.issued !== undefined && l.issued !== null);
  const short = (l: RequisitionLine) =>
    showBalance && l.balance !== undefined && Number(l.balance) < Number(l.approved ?? l.quantity) && (l.issued === undefined || l.issued === null);
  return (
    <div data-testid="requisition-lines">
      <ul className="flex flex-col gap-2 md:hidden">
        {lines.map((l, i) => (
          <li key={l.item_id} className={cn("rounded-lg border p-3", short(l) && "border-amber-400 bg-amber-50")}>
            <p className="font-semibold">
              {i + 1}. {l.code} {l.name}
            </p>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 text-sm">
              <dt className="text-muted-foreground">ขอเบิก</dt>
              <dd className="tabular-nums">
                {qty(l.quantity)} {l.unit}
              </dd>
              {showBalance ? (
                <>
                  <dt className="text-muted-foreground">คงเหลือในคลัง</dt>
                  <dd className="tabular-nums">
                    {qty(l.balance)} {l.unit}
                  </dd>
                </>
              ) : null}
              {hasApproved ? (
                <>
                  <dt className="text-muted-foreground">อนุมัติ</dt>
                  <dd className="tabular-nums">{qty(l.approved)}</dd>
                </>
              ) : null}
              {hasIssued ? (
                <>
                  <dt className="text-muted-foreground">จ่ายจริง</dt>
                  <dd className="tabular-nums">{qty(l.issued)}</dd>
                </>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
      <div className="relative hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead className="bg-secondary">
            <tr>
              <th scope="col" className="px-3 py-2">ที่</th>
              <th scope="col" className="px-3 py-2">วัสดุ</th>
              <th scope="col" className="px-3 py-2 text-right">ขอเบิก</th>
              {showBalance ? <th scope="col" className="px-3 py-2 text-right">คงเหลือในคลัง</th> : null}
              {hasApproved ? <th scope="col" className="px-3 py-2 text-right">อนุมัติ</th> : null}
              {hasIssued ? <th scope="col" className="px-3 py-2 text-right">จ่ายจริง</th> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.item_id} className={cn("border-t", short(l) && "bg-amber-50")} data-testid="req-line">
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2">
                  {l.code} {l.name}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {qty(l.quantity)} {l.unit}
                </td>
                {showBalance ? (
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="line-balance">
                    {qty(l.balance)} {l.unit}
                  </td>
                ) : null}
                {hasApproved ? <td className="px-3 py-2 text-right tabular-nums">{qty(l.approved)}</td> : null}
                {hasIssued ? <td className="px-3 py-2 text-right tabular-nums">{qty(l.issued)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
