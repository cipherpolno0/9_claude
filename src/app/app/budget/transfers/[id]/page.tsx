import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BudgetTransferSummary } from "@/components/budget-transfer-summary";
import { InfoText } from "@/components/form";
import { TRANSFER_STATUS_CLASS, TRANSFER_STATUS_LABEL, isUuid } from "@/lib/budget";
import { fetchItemDetail, fetchTransfer } from "@/lib/budget-server";
import { fetchRequestDetail } from "@/lib/requests/queries";
import { thaiDateTime } from "@/lib/thai";

import { budgetQuery, loadBudgetScope } from "../../scope";
import { TransferForm } from "../transfer-form";

export const metadata: Metadata = { title: "คำขอโอนเปลี่ยนแปลง" };
export const dynamic = "force-dynamic";

export default async function TransferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const search = await searchParams;
  const { ctx } = await loadBudgetScope(search);
  // RLS: เห็นได้เฉพาะผู้ยื่นและผู้มีสิทธิ์ดูงบของหน่วยเจ้าของ
  const t = await fetchTransfer(id);
  if (!t) notFound();
  const request = t.request_id ? await fetchRequestDetail(t.request_id) : null;
  const q = budgetQuery(null, { id: t.org_unit_id }, { year: String(request?.payload.year_be ?? "") });
  const saved = typeof search.saved === "string" ? search.saved : null;
  const mine = t.created_by === ctx.user.id;
  const [from, to] = await Promise.all([fetchItemDetail(t.from_item_id, t.org_unit_id), fetchItemDetail(t.to_item_id, t.org_unit_id)]);

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={`/app/budget/transfers?${q}`} className="text-primary underline underline-offset-4">
          ← คำขอโอนเปลี่ยนแปลง
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">คำขอโอนเปลี่ยนแปลง {request?.request_no ?? ""}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
        <span className={`rounded border px-2 py-0.5 text-sm ${TRANSFER_STATUS_CLASS[t.status] ?? ""}`} data-testid="transfer-status">
          {TRANSFER_STATUS_LABEL[t.status] ?? t.status}
        </span>
        ยื่นเมื่อ {thaiDateTime(t.created_at)}
        {t.applied_at ? ` · ย้ายวงเงินแล้วเมื่อ ${thaiDateTime(t.applied_at)}` : ""}
      </p>
      {saved ? (
        <div className="mt-4">
          <InfoText>{saved}</InfoText>
        </div>
      ) : null}
      <div className="mt-6 rounded-xl border bg-card p-5">
        {request ? <BudgetTransferSummary payload={request.payload} applied={t.status === "approved"} /> : null}
        <p className="mt-3">
          <span className="text-muted-foreground">เหตุผล:</span> {t.reason}
        </p>
        {request ? (
          <p className="mt-3">
            <Link href={`/app/approvals/${request.id}`} className="text-primary underline underline-offset-4">
              ดูสถานะการพิจารณา ความเห็น และไฟล์แนบ ที่หน้าคำขอ
            </Link>
          </p>
        ) : null}
      </div>
      {mine && t.status === "returned" && from && to ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="text-xl font-bold text-primary">แก้ไขแล้วส่งใหม่</h2>
          <p className="text-muted-foreground">ผู้พิจารณาส่งกลับให้แก้ไข อ่านความเห็นที่หน้าคำขอ แล้วแก้จำนวนเงินหรือเหตุผล</p>
          <TransferForm
            items={[
              { id: from.id, path: from.path, amount: Number(from.received), free: Number(from.remaining) },
              { id: to.id, path: to.path, amount: Number(to.received), free: Number(to.remaining) },
            ]}
            initialFrom={from.id}
            query={q}
            resubmit={{ id: t.id, from: from.id, to: to.id, amount: String(t.amount), reason: t.reason }}
          />
        </div>
      ) : null}
      {mine && t.status === "pending" ? (
        <p className="mt-6 text-muted-foreground">ต้องการยกเลิกคำขอ ให้กด ยกเลิกคำขอ ที่หน้าคำขอ</p>
      ) : null}
    </section>
  );
}
