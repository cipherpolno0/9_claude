import { QUESTION_STATUS_CLASS, QUESTION_STATUS_LABEL, type QuestionStatus } from "@/lib/quiz";
import { cn } from "@/lib/utils";

/** ป้ายสีของสถานะข้อสอบ (ร่าง / เผยแพร่) และข้อที่ปิดใช้งาน */
export function QuestionStatusBadge({ status, isActive = true }: { status: string; isActive?: boolean }) {
  const key = isActive ? status : "inactive";
  return (
    <span
      data-status={key}
      className={cn(
        "inline-block rounded-full border px-3 py-0.5 text-sm font-semibold whitespace-nowrap",
        QUESTION_STATUS_CLASS[key] ?? "border-input bg-muted",
      )}
    >
      {isActive ? (QUESTION_STATUS_LABEL[status as QuestionStatus] ?? status) : "ปิดใช้งาน"}
    </span>
  );
}
