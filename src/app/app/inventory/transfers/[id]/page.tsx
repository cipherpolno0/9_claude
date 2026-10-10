import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InfoText } from "@/components/form";
import { requireMenu } from "@/lib/auth/guards";
import { isUuid } from "@/lib/budget";
import { qty } from "@/lib/inventory";
import { fetchTransferDetail } from "@/lib/inventory-server";
import { thaiDate, thaiDateTime } from "@/lib/thai";

import { TransferBadge } from "../../ui";
import { CancelTransferForm, ReceiveTransferForm } from "./transfer-actions";

export const metadata: Metadata = { title: "ใบโอนวัสดุ" };
export const dynamic = "force-dynamic";

export default async function TransferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMenu("/app/inventory");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const t = await fetchTransferDetail(id);
  if (!t) notFound();
  const saved = (await searchParams).saved;
  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/inventory/transfers" className="text-primary underline underline-offset-4">
          ← โอนวัสดุ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ใบโอน {t.transfer_no}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
        <TransferBadge status={t.status} /> โอนโดย {t.created_by_name} วันที่ {thaiDate(t.sent_on)}
      </p>
      {typeof saved === "string" ? (
        <div className="mt-4">
          <InfoText>{saved}</InfoText>
        </div>
      ) : null}
      <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">จาก</dt>
          <dd>
            {t.from_name} · {t.from_unit_name}
          </dd>
          <dt className="text-muted-foreground">ถึง</dt>
          <dd>
            {t.to_name} · {t.to_unit_name}
          </dd>
          {t.note ? (
            <>
              <dt className="text-muted-foreground">หมายเหตุ</dt>
              <dd>{t.note}</dd>
            </>
          ) : null}
          {t.status === "received" ? (
            <>
              <dt className="text-muted-foreground">รับเข้าคลัง</dt>
              <dd data-testid="transfer-received">
                {thaiDate(t.received_on)} โดย {t.received_by_name}
              </dd>
            </>
          ) : null}
          {t.status === "cancelled" ? (
            <>
              <dt className="text-muted-foreground">ยกเลิก</dt>
              <dd data-testid="transfer-cancelled">
                {thaiDateTime(t.cancelled_at)} โดย {t.cancelled_by_name} · {t.cancel_reason}
              </dd>
            </>
          ) : null}
        </dl>
        <ul className="mt-4 flex flex-col divide-y rounded-lg border" data-testid="transfer-lines">
          {t.lines.map((l) => (
            <li key={l.item_id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
              <span>
                {l.code} {l.name}
              </span>
              <span className="font-semibold tabular-nums">
                {qty(l.quantity)} {l.unit}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {t.can_receive ? (
        <div className="mt-6 rounded-xl border-2 border-ring bg-card p-4 sm:p-5">
          <h2 className="text-xl font-bold text-primary">รับวัสดุเข้า{t.to_name}</h2>
          <p className="mt-1 text-muted-foreground">ตรวจนับของให้ครบตามรายการก่อนกดรับ ระบบเพิ่มยอดคลังปลายทางทันที</p>
          <div className="mt-3">
            <ReceiveTransferForm id={t.id} />
          </div>
        </div>
      ) : null}
      {t.can_cancel ? (
        <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="text-xl font-bold text-primary">ยกเลิกใบโอน</h2>
          <div className="mt-3">
            <CancelTransferForm id={t.id} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
