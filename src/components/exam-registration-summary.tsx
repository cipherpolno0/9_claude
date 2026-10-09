import Link from "next/link";

import { examName } from "@/lib/exam-forms";

/** สรุปคำขอ ส่งบัญชีผู้สมัครสอบ (REG) ในหน้ารายละเอียดคำขอกลาง: ไม่มีข้อมูลรายบุคคล ลิงก์ไปหน้าบัญชี */
export function ExamRegistrationSummary({ payload }: { payload: Record<string, unknown> }) {
  const str = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : "");
  const num = (k: string) => (typeof payload[k] === "number" ? (payload[k] as number) : Number(payload[k] ?? 0));
  const batchId = str("batch_id");
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2" data-testid="exam-registration-summary">
      <div>
        <dt className="text-sm text-muted-foreground">การสอบ</dt>
        <dd>
          {examName(str("exam_type"), str("level"))} ปีการศึกษา {num("year_be")} (แบบ {str("form_code")})
        </dd>
      </div>
      <div>
        <dt className="text-sm text-muted-foreground">สำนักหรือสถานศึกษา</dt>
        <dd className="break-words">
          {str("place_name")} ({str("place_code")})
        </dd>
      </div>
      <div>
        <dt className="text-sm text-muted-foreground">สนามสอบ</dt>
        <dd className="break-words">
          {str("venue_name")} (รหัส {str("venue_code")})
        </dd>
      </div>
      <div>
        <dt className="text-sm text-muted-foreground">จำนวนผู้สมัครเมื่อส่ง</dt>
        <dd className="font-semibold">{num("candidates").toLocaleString("th-TH")} คน</dd>
      </div>
      {batchId ? (
        <div className="sm:col-span-2">
          <Link href={`/app/exams/batches/${batchId}`} className="text-primary underline underline-offset-4">
            เปิดบัญชีรายชื่อผู้สมัคร (ตรวจรายชื่อก่อนรับรอง)
          </Link>
        </div>
      ) : null}
    </dl>
  );
}
