import Link from "next/link";

import type { PendingRequest } from "@/lib/requests/queries";
import { thaiDate } from "@/lib/thai";

/** กล่อง "งานรอพิจารณา" บนแดชบอร์ด: คำขอจากทุกระบบที่รอผู้ใช้คนนี้พิจารณา */
export function PendingRequestsBox({ items, limit = 5 }: { items: PendingRequest[]; limit?: number }) {
  return (
    <div className="rounded-xl border bg-card p-5" data-testid="pending-box">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-primary">งานรอพิจารณา ({items.length})</h2>
        <Link href="/app/approvals" className="text-primary underline underline-offset-4">
          ดูทั้งหมดและคำขอที่ท่านยื่น
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-muted-foreground">ไม่มีคำขอรอท่านพิจารณา</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.slice(0, limit).map((r) => (
            <li key={r.request_id}>
              <Link href={`/app/approvals/${r.request_id}`} className="block rounded-lg border p-3 hover:bg-secondary">
                <span className="block font-semibold">
                  {r.request_no} · {r.title}
                </span>
                <span className="block text-muted-foreground">
                  {r.type_name} · จาก {r.org_unit_name} · ยื่นโดย {r.requester_name} · {thaiDate(r.submitted_at, "short")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > limit ? (
        <p className="mt-2 text-sm text-muted-foreground">แสดง {limit} รายการแรกจาก {items.length} รายการ</p>
      ) : null}
    </div>
  );
}
