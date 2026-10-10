import { baht } from "@/lib/budget";

/** สรุปคำขอโอนเปลี่ยนแปลงงบประมาณ (ใช้ในหน้ารายละเอียดคำขอกลางและหน้าคำขอโอน) */
export function BudgetTransferSummary({ payload, applied }: { payload: Record<string, unknown>; applied: boolean }) {
  const s = (k: string) => (typeof payload[k] === "string" || typeof payload[k] === "number" ? String(payload[k]) : "");
  const amount = Number(s("amount") || 0);
  const fromAmount = s("from_amount");
  const toAmount = s("to_amount");
  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[12rem_1fr]" data-testid="budget-transfer-summary">
      <dt className="text-muted-foreground">ปีงบประมาณ</dt>
      <dd>{s("year_be")}</dd>
      <dt className="text-muted-foreground">หน่วยเจ้าของงบ</dt>
      <dd>{s("unit_name")}</dd>
      <dt className="text-muted-foreground">โอนจากรายการ</dt>
      <dd>
        {s("from_path")}
        {fromAmount ? (
          <span className="block text-sm text-muted-foreground">
            วงเงินขณะยื่น {baht(fromAmount)} {applied ? "" : `> หลังโอน ${baht(Number(fromAmount) - amount)}`}
          </span>
        ) : null}
      </dd>
      <dt className="text-muted-foreground">ไปยังรายการ</dt>
      <dd>
        {s("to_path")}
        {toAmount ? (
          <span className="block text-sm text-muted-foreground">
            วงเงินขณะยื่น {baht(toAmount)} {applied ? "" : `> หลังโอน ${baht(Number(toAmount) + amount)}`}
          </span>
        ) : null}
      </dd>
      <dt className="text-muted-foreground">จำนวนเงินที่โอน</dt>
      <dd className="text-lg font-bold text-primary tabular-nums">{baht(amount)} บาท</dd>
      {applied ? (
        <>
          <dt className="text-muted-foreground">ผล</dt>
          <dd className="font-semibold text-green-800">ระบบย้ายวงเงินระหว่าง 2 รายการแล้ว</dd>
        </>
      ) : null}
    </dl>
  );
}
