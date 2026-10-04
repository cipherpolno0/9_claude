import Link from "next/link";

import { personStatusLabel } from "@/lib/persons";
import { statusChangeLabel, type StatusChange } from "@/lib/status";
import { thaiDate } from "@/lib/thai";

/** เส้นเวลาสถานะของบุคคล (จากตาราง status_changes) ใหม่สุดอยู่บน */
export function StatusTimeline({
  changes,
  personType,
  currentStatus,
}: {
  changes: StatusChange[];
  personType: string;
  currentStatus: string;
}) {
  return (
    <div data-testid="status-timeline">
      <p>
        <span className="font-semibold">สถานะปัจจุบัน:</span>{" "}
        <span className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">
          {personStatusLabel(currentStatus, personType)}
        </span>
      </p>
      {changes.length === 0 ? (
        <p className="mt-3 text-muted-foreground">ยังไม่มีการเปลี่ยนสถานะ</p>
      ) : (
        <ol className="mt-4">
          {changes.map((c, index) => (
            <li key={c.id} className="relative flex gap-3 pb-5 last:pb-0">
              {index < changes.length - 1 ? (
                <span aria-hidden className="absolute top-4 bottom-0 left-2 w-0.5 -translate-x-1/2 bg-input" />
              ) : null}
              <span aria-hidden className="z-10 mt-1 size-4 shrink-0 rounded-full border-2 border-primary bg-primary" />
              <div>
                <p className="font-semibold">
                  {thaiDate(c.effective_on)} · {statusChangeLabel(c.change_type, personType)}
                </p>
                {c.change_type === "transfer" ? (
                  <p>
                    จาก {[c.from_place, c.from_unit_name].filter(Boolean).join(" · ") || "-"} ไป{" "}
                    {[c.to_place, c.to_unit_name].filter(Boolean).join(" · ") || "-"}
                  </p>
                ) : null}
                {c.reason ? <p>เหตุผล: {c.reason}</p> : null}
                <p className="text-sm text-muted-foreground">
                  สถานะ: {personStatusLabel(c.status_before, personType)} → {personStatusLabel(c.status_after, personType)}
                  {c.request_id ? (
                    <>
                      {" · "}
                      {c.request_no ? (
                        <Link href={`/app/approvals/${c.request_id}`} className="text-primary underline underline-offset-4">
                          คำขอ {c.request_no} และเอกสารแนบ
                        </Link>
                      ) : (
                        "มีคำขอที่เกี่ยวข้อง (ท่านไม่มีสิทธิ์เปิดดู)"
                      )}
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
