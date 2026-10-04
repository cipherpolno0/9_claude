import { Check, Clock, CornerUpLeft, Minus, X } from "lucide-react";

import { LEVEL_LABEL } from "@/lib/org-units";
import {
  REQUEST_STATUS_LABEL,
  STEP_STATUS_LABEL,
  type StepStatus,
  type TimelineData,
} from "@/lib/requests/labels";
import { thaiDateTime } from "@/lib/thai";
import { cn } from "@/lib/utils";

/**
 * เส้นเวลาสถานะคำขอ ใช้ได้ทั้งหน้าสาธารณะและพื้นที่ทำงาน
 * หน้าสาธารณะ: ส่งข้อมูลจาก public_request_status() ซึ่งไม่มีชื่อผู้พิจารณาและความเห็น
 * พื้นที่ทำงาน: ส่ง decider_name และ comment มาด้วย
 */

const ICON: Record<StepStatus, React.ComponentType<{ className?: string }>> = {
  waiting: Minus,
  pending: Clock,
  approved: Check,
  rejected: X,
  returned: CornerUpLeft,
};

const DOT: Record<StepStatus, string> = {
  waiting: "border-input bg-background text-muted-foreground",
  pending: "border-ring bg-accent text-accent-foreground",
  approved: "border-primary bg-primary text-primary-foreground",
  rejected: "border-destructive bg-destructive text-white",
  returned: "border-ring bg-gold text-gold-foreground",
};

export function RequestTimeline({
  data,
  approvedLabel,
}: {
  data: TimelineData;
  /** คำที่ใช้แทน "เห็นชอบ" ของขั้นที่ผ่านแล้ว (เช่น "รับทราบ" สำหรับการแจ้ง) */
  approvedLabel?: string;
}) {
  return (
    <div data-testid="request-timeline">
      <p className="font-semibold">
        {data.request_no} · {data.type_name} ·{" "}
        <span
          className={cn(
            "rounded border px-2 py-0.5 text-sm",
            data.status === "rejected" ? "border-destructive text-destructive" : "border-input text-primary",
          )}
        >
          {data.status === "approved" && approvedLabel ? `${approvedLabel}แล้ว` : REQUEST_STATUS_LABEL[data.status]}
        </span>
      </p>
      <ol className="mt-3">
        <li className="relative flex gap-3 pb-5">
          <span aria-hidden className="absolute top-8 bottom-0 left-4 w-0.5 -translate-x-1/2 bg-input" />
          <span className={cn("z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2", DOT.approved)}>
            <Check className="size-4" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">ยื่นคำขอ</p>
            <p className="text-sm text-muted-foreground">{thaiDateTime(data.submitted_at)}</p>
          </div>
        </li>
        {data.steps.map((step, index) => {
          const Icon = ICON[step.status];
          const isLast = index === data.steps.length - 1;
          return (
            <li key={step.step_no} className={cn("relative flex gap-3", !isLast && "pb-5")}>
              {!isLast ? <span aria-hidden className="absolute top-8 bottom-0 left-4 w-0.5 -translate-x-1/2 bg-input" /> : null}
              <span className={cn("z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2", DOT[step.status])}>
                <Icon className="size-4" aria-hidden />
              </span>
              <div className={cn(step.status === "waiting" && "text-muted-foreground")}>
                <p className="font-semibold">
                  ขั้นที่ {step.step_no} · {LEVEL_LABEL[step.level]} · {step.unit_name}
                </p>
                <p className="text-sm">
                  {step.status === "approved" && approvedLabel ? approvedLabel : STEP_STATUS_LABEL[step.status]}
                  {step.decided_at ? ` · ${thaiDateTime(step.decided_at)}` : ""}
                  {step.decider_name ? ` · โดย ${step.decider_name}` : ""}
                </p>
                {step.comment ? <p className="mt-0.5 text-sm">ความเห็น: {step.comment}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {data.status === "cancelled" ? <p className="mt-3 font-medium">ผู้ยื่นยกเลิกคำขอนี้แล้ว</p> : null}
    </div>
  );
}
