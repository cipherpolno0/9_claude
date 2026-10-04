import { PLACE_STATUS_CLASS, PLACE_STATUS_LABEL, type PlaceStatus } from "@/lib/places";
import { cn } from "@/lib/utils";

/** ป้ายสีของสถานะสถานที่ (เปิดดำเนินการ / ระงับ / ยุบ) และรายการที่ปิดใช้งาน */
export function PlaceStatusBadge({ status, isActive = true }: { status: string; isActive?: boolean }) {
  return (
    <span
      data-status={isActive ? status : "inactive"}
      className={cn(
        "inline-block rounded-full border px-3 py-0.5 text-sm font-semibold whitespace-nowrap",
        isActive ? (PLACE_STATUS_CLASS[status] ?? "border-input bg-muted") : "border-input bg-muted text-muted-foreground",
      )}
    >
      {isActive ? (PLACE_STATUS_LABEL[status as PlaceStatus] ?? status) : "ปิดใช้งาน"}
    </span>
  );
}
