import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Attachments } from "@/components/attachments";
import { InfoText } from "@/components/form";
import { requireMenu } from "@/lib/auth/guards";
import { baht, isUuid } from "@/lib/budget";
import { SOURCE_LABEL, qty } from "@/lib/inventory";
import { fetchReceiptDetail } from "@/lib/inventory-server";
import { thaiDate, thaiDateTime } from "@/lib/thai";

export const metadata: Metadata = { title: "เอกสารรับวัสดุเข้าคลัง" };
export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu("/app/inventory");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const r = await fetchReceiptDetail(id);
  if (!r) notFound();
  const saved = (await searchParams).saved;
  const total = r.lines.reduce((s, l) => Math.round((s + Number(l.amount)) * 100) / 100, 0);
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={`/app/inventory/receipts?w=${r.warehouse_id}`} className="text-primary underline underline-offset-4">
          ← รับวัสดุเข้าคลัง
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">รับเข้า {r.receipt_no}</h1>
      <p className="mt-1 text-muted-foreground">
        บันทึกโดย {r.created_by_name} เมื่อ {thaiDateTime(r.created_at)}
      </p>
      {typeof saved === "string" ? (
        <div className="mt-4">
          <InfoText>{saved}</InfoText>
        </div>
      ) : null}
      <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]" data-testid="receipt-info">
          <dt className="text-muted-foreground">คลัง</dt>
          <dd>
            {r.warehouse_name} · {r.unit_name}
          </dd>
          <dt className="text-muted-foreground">ที่มา</dt>
          <dd>
            {SOURCE_LABEL[r.source]}
            {r.supplier ? ` · ${r.supplier}` : ""}
          </dd>
          <dt className="text-muted-foreground">วันที่รับ</dt>
          <dd>{thaiDate(r.received_on)}</dd>
          <dt className="text-muted-foreground">เลขที่ใบส่งของ</dt>
          <dd>{r.document_no || "-"}</dd>
          {r.disbursement ? (
            <>
              <dt className="text-muted-foreground">อ้างอิงเบิกจ่ายงบ</dt>
              <dd data-testid="receipt-disbursement">
                {r.disbursement.request_no ?? "คำขอใช้งบ"} งวดที่ {r.disbursement.installment_no} · จ่ายวันที่ {thaiDate(r.disbursement.paid_on, "short")} ·{" "}
                {baht(r.disbursement.amount)} บาท{r.disbursement.voucher_no ? ` · ใบสำคัญ ${r.disbursement.voucher_no}` : ""}
                <span className="block text-sm text-muted-foreground">{r.disbursement.purpose}</span>
              </dd>
            </>
          ) : null}
          {r.note ? (
            <>
              <dt className="text-muted-foreground">หมายเหตุ</dt>
              <dd>{r.note}</dd>
            </>
          ) : null}
        </dl>
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left" data-testid="receipt-lines">
            <thead className="bg-secondary">
              <tr>
                <th scope="col" className="px-3 py-2">วัสดุ</th>
                <th scope="col" className="px-3 py-2 text-right">จำนวน</th>
                <th scope="col" className="px-3 py-2 text-right">ราคาต่อหน่วย</th>
                <th scope="col" className="px-3 py-2 text-right">เป็นเงิน (บาท)</th>
              </tr>
            </thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.item_id} className="border-t">
                  <td className="px-3 py-2">
                    {l.code} {l.name}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {qty(l.quantity)} {l.unit}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(l.unit_price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(l.amount)}</td>
                </tr>
              ))}
              <tr className="border-t font-semibold">
                <td className="px-3 py-2" colSpan={3}>
                  รวม
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{baht(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-xl font-bold text-primary">ใบส่งของและเอกสารแนบ</h2>
        <div className="mt-3">
          <Attachments
            entityTable="stock_receipts"
            entityId={r.id}
            orgUnitId={r.org_unit_id}
            currentUserId={ctx.user.id}
            canUpload={r.can_attach}
            inputLabel="แนบใบส่งของ"
          />
        </div>
      </div>
    </section>
  );
}
