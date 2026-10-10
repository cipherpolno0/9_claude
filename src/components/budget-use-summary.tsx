import { baht, type UseLine } from "@/lib/budget";

/** ตารางรายละเอียดค่าใช้จ่ายของคำขอใช้งบ (หน้าคำขอกลางและหน้าคำขอใช้งบ) */
export function UseLinesTable({ lines, total }: { lines: UseLine[]; total: number | string }) {
  return (
    <div className="relative mt-4 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left" data-testid="use-lines">
        <caption className="mb-2 text-left font-semibold">รายละเอียดค่าใช้จ่าย</caption>
        <thead className="bg-secondary">
          <tr>
            <th scope="col" className="px-3 py-2">ที่</th>
            <th scope="col" className="px-3 py-2">รายการ</th>
            <th scope="col" className="px-3 py-2 text-right">จำนวน</th>
            <th scope="col" className="px-3 py-2 text-right">ราคาต่อหน่วย</th>
            <th scope="col" className="px-3 py-2 text-right">เป็นเงิน (บาท)</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-t">
              <td className="px-3 py-2">{i + 1}</td>
              <td className="px-3 py-2">{l.description}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {Number(l.quantity).toLocaleString("th-TH")} {l.unit}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{baht(l.unit_price)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{baht(l.amount)}</td>
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td className="px-3 py-2" colSpan={4}>
              รวมทั้งสิ้น
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{baht(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** สรุปคำขอใช้งบประมาณจาก requests.payload (หน้ารายละเอียดคำขอกลาง) */
export function BudgetUseSummary({ payload, approved }: { payload: Record<string, unknown>; approved: boolean }) {
  const s = (k: string) => (typeof payload[k] === "string" || typeof payload[k] === "number" ? String(payload[k]) : "");
  const lines = Array.isArray(payload.lines) ? (payload.lines as UseLine[]) : [];
  return (
    <div data-testid="budget-use-summary">
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[12rem_1fr]">
        <dt className="text-muted-foreground">ปีงบประมาณ</dt>
        <dd>{s("year_be")}</dd>
        <dt className="text-muted-foreground">หน่วยที่ใช้เงิน</dt>
        <dd>{s("unit_name")}</dd>
        <dt className="text-muted-foreground">รายการงบประมาณ</dt>
        <dd>
          {s("item_path")}
          {s("owner_unit_name") && s("owner_unit_name") !== s("unit_name") ? (
            <span className="block text-sm text-muted-foreground">งบของ {s("owner_unit_name")} (ได้รับจัดสรร)</span>
          ) : null}
        </dd>
        <dt className="text-muted-foreground">คงเหลือขณะยื่น</dt>
        <dd className="tabular-nums">{baht(s("available"))} บาท</dd>
        <dt className="text-muted-foreground">จำนวนเงินที่ขอใช้</dt>
        <dd className="text-lg font-bold text-primary tabular-nums">{baht(s("amount"))} บาท</dd>
        {approved ? (
          <>
            <dt className="text-muted-foreground">ผล</dt>
            <dd className="font-semibold text-green-800">อนุมัติแล้ว ระบบกันเงิน (ผูกพัน) จากรายการนี้แล้ว</dd>
          </>
        ) : null}
      </dl>
      <UseLinesTable lines={lines} total={s("amount")} />
    </div>
  );
}
