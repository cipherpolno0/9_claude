import { PLACE_REQUEST_TITLE, PLACE_REQUEST_TYPES } from "@/lib/place-requests";
import { REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/requests/labels";
import type { PublicSummaryRow } from "@/lib/track";

const STATUSES: RequestStatus[] = ["pending", "returned", "approved", "rejected", "cancelled"];
const cell = "border px-2 py-1.5";

/** ตารางสรุปจำนวนคำขอของปี: แถว = ภาค และชนิดคำขอ คอลัมน์ = สถานะ */
export function SummaryTable({ rows, year }: { rows: PublicSummaryRow[]; year: number }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground" data-testid="summary-empty">
        ปี {year} ยังไม่มีคำขอ
      </p>
    );
  }
  const regions = [...new Set(rows.map((r) => r.region_name ?? ""))].sort((a, b) =>
    a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "th", { numeric: true }),
  );
  const count = (region: string | null, type: string | null, status: RequestStatus | null) =>
    rows
      .filter(
        (r) =>
          (region === null || (r.region_name ?? "") === region) &&
          (type === null || r.type_key === type) &&
          (status === null || r.status === status),
      )
      .reduce((sum, r) => sum + r.total, 0);
  const num = (n: number) => (n === 0 ? "-" : n.toLocaleString("th-TH"));

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-sm text-muted-foreground sm:hidden">เลื่อนตารางไปทางขวาเพื่อดูจำนวนของแต่ละสถานะ</p>
      <table className="w-full min-w-[44rem] border-collapse text-left" data-testid="summary-table">
        <caption className="sr-only">จำนวนคำขอของปี {year} แยกตามภาค ชนิดคำขอ และสถานะ</caption>
        <thead>
          <tr className="bg-muted">
            <th scope="col" className={cell}>ภาค</th>
            <th scope="col" className={cell}>ชนิดคำขอ</th>
            {STATUSES.map((s) => (
              <th key={s} scope="col" className={`${cell} text-right`}>
                {REQUEST_STATUS_LABEL[s]}
              </th>
            ))}
            <th scope="col" className={`${cell} text-right`}>รวม</th>
          </tr>
        </thead>
        <tbody>
          {regions.map((region) => {
            const types = PLACE_REQUEST_TYPES.filter((t) => count(region, t, null) > 0);
            return types.map((type, index) => (
              <tr key={`${region}-${type}`} data-region={region || "none"} data-type={type}>
                {index === 0 ? (
                  <th scope="rowgroup" rowSpan={types.length} className={`${cell} align-top font-semibold`}>
                    {region || "ไม่อยู่ใต้ภาคใด"}
                  </th>
                ) : null}
                <th scope="row" className={`${cell} font-normal`}>{PLACE_REQUEST_TITLE[type]}</th>
                {STATUSES.map((s) => (
                  <td key={s} className={`${cell} text-right`} data-status={s}>
                    {num(count(region, type, s))}
                  </td>
                ))}
                <td className={`${cell} text-right font-semibold`} data-status="total">
                  {num(count(region, type, null))}
                </td>
              </tr>
            ));
          })}
          <tr className="bg-muted font-semibold" data-testid="summary-total">
            <th scope="row" colSpan={2} className={cell}>รวมทั้งหมด</th>
            {STATUSES.map((s) => (
              <td key={s} className={`${cell} text-right`} data-status={s}>
                {num(count(null, null, s))}
              </td>
            ))}
            <td className={`${cell} text-right`} data-status="total">
              {num(count(null, null, null))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
