import { personStatusLabel } from "@/lib/persons";
import { STATUS_BADGE_CLASS } from "@/lib/reports";
import { cn } from "@/lib/utils";

/** ป้ายสีของสถานะบุคคล (มรณภาพ-ตาย เลือกคำตามประเภทบุคคล) */
export function StatusBadge({ status, personType }: { status: string; personType: string }) {
  return (
    <span
      data-status={status}
      className={cn(
        "inline-block rounded-full border px-3 py-0.5 text-sm font-semibold whitespace-nowrap",
        STATUS_BADGE_CLASS[status] ?? "border-input bg-muted",
      )}
    >
      {personStatusLabel(status, personType)}
    </span>
  );
}
