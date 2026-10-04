import { VENUE_STATUS_CLASS, VENUE_STATUS_LABEL, type VenueStatus } from "@/lib/venues";
import { cn } from "@/lib/utils";

/** ป้ายสีของสถานะสนามสอบ (เปิด / ปิด / ย้าย) และรายการที่ปิดใช้งาน */
export function VenueStatusBadge({ status, isActive = true }: { status: string; isActive?: boolean }) {
  return (
    <span
      data-status={isActive ? status : "inactive"}
      className={cn(
        "inline-block rounded-full border px-3 py-0.5 text-sm font-semibold whitespace-nowrap",
        isActive ? (VENUE_STATUS_CLASS[status] ?? "border-input bg-muted") : "border-input bg-muted text-muted-foreground",
      )}
    >
      {isActive ? (VENUE_STATUS_LABEL[status as VenueStatus] ?? status) : "ปิดใช้งาน"}
    </span>
  );
}
