import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InfoText } from "@/components/form";
import { RequisitionLines } from "@/components/requisition-lines";
import { requireMenu } from "@/lib/auth/guards";
import { isUuid } from "@/lib/budget";
import { WAREHOUSE_KIND_LABEL, qty } from "@/lib/inventory";
import { fetchItemOptions, fetchRequisitionDetail } from "@/lib/inventory-server";
import { thaiDate, thaiDateTime } from "@/lib/thai";

import { RequisitionForm } from "../../stock-forms";
import { RequisitionBadge } from "../../ui";
import { IssueForm } from "./req-actions";

export const metadata: Metadata = { title: "ใบเบิกวัสดุ" };
export const dynamic = "force-dynamic";

export default async function RequisitionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMenu("/app/inventory");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const search = await searchParams;
  // ฐานข้อมูลตรวจสิทธิ์: ผู้ยื่น ผู้มีสิทธิ์ดูคลังของหน่วย หรือผู้พิจารณาในเส้นทาง
  const r = await fetchRequisitionDetail(id);
  if (!r) notFound();
  const saved = typeof search.saved === "string" ? search.saved : null;
  const options = r.can_resubmit ? await fetchItemOptions(r.warehouse_id) : [];

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/inventory/requisitions" className="text-primary underline underline-offset-4">
          ← ใบเบิกวัสดุ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">ใบเบิกวัสดุ {r.request_no ?? ""}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
        <RequisitionBadge status={r.status} />
        ยื่นเมื่อ {thaiDateTime(r.created_at)}
        {r.approved_at ? ` · อนุมัติเมื่อ ${thaiDateTime(r.approved_at)}` : ""}
      </p>
      {saved ? (
        <div className="mt-4">
          <InfoText>{saved}</InfoText>
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">คลัง</dt>
          <dd>
            {r.warehouse_name} ({WAREHOUSE_KIND_LABEL[r.warehouse_kind]}) · {r.unit_name}
          </dd>
          <dt className="text-muted-foreground">ผู้ยื่น</dt>
          <dd>{r.requester_name}</dd>
          <dt className="text-muted-foreground">วัตถุประสงค์</dt>
          <dd className="whitespace-pre-line">{r.purpose}</dd>
          {r.status === "issued" ? (
            <>
              <dt className="text-muted-foreground">จ่ายของ</dt>
              <dd data-testid="issued-info">
                {thaiDate(r.issued_on)} โดย {r.issued_by_name}
                {r.issue_note ? ` · ${r.issue_note}` : ""}
              </dd>
            </>
          ) : null}
        </dl>
        <div className="mt-4">
          <RequisitionLines lines={r.lines} showBalance={r.status !== "issued" && r.status !== "cancelled" && r.status !== "rejected"} />
        </div>
        {r.request_id ? (
          <p className="mt-3">
            <Link href={`/app/approvals/${r.request_id}`} className="text-primary underline underline-offset-4" data-testid="open-request">
              {r.can_decide ? "พิจารณาใบเบิกนี้ (ปรับจำนวนและอนุมัติ) ที่หน้าคำขอ" : "ดูสถานะการพิจารณา ความเห็น และไฟล์แนบ ที่หน้าคำขอ"}
            </Link>
          </p>
        ) : null}
      </div>

      {r.can_issue ? (
        <div className="mt-6 rounded-xl border-2 border-ring bg-card p-4 sm:p-5">
          <h2 className="text-xl font-bold text-primary">จ่ายของตามใบเบิก</h2>
          {r.lines.some((l) => Number(l.balance ?? 0) < Number(l.approved ?? 0)) ? (
            <p className="mt-2 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-amber-950">
              บางรายการคงเหลือไม่พอตามที่อนุมัติ ระบบตั้งจำนวนจ่ายเท่าที่มีให้ (จ่ายเพิ่มภายหลังไม่ได้ ให้ยื่นใบเบิกใหม่)
            </p>
          ) : null}
          <div className="mt-3">
            <IssueForm id={r.id} lines={r.lines} />
          </div>
        </div>
      ) : null}

      {r.status === "approved" && !r.can_issue ? (
        <p className="mt-6 rounded-xl border bg-card p-4">อนุมัติแล้ว รอเจ้าหน้าที่พัสดุของ{r.unit_name}จ่ายของ</p>
      ) : null}

      {r.can_resubmit ? (
        <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
          <h2 className="text-xl font-bold text-primary">แก้ไขแล้วส่งใหม่</h2>
          <p className="text-muted-foreground">ผู้พิจารณาส่งกลับให้แก้ไข อ่านความเห็นที่หน้าคำขอ</p>
          <RequisitionForm
            warehouse={{ id: r.warehouse_id, name: r.warehouse_name }}
            options={options}
            resubmit={{ id: r.id, purpose: r.purpose, lines: r.lines.map((l) => ({ item_id: l.item_id, quantity: String(Number(l.quantity)) })) }}
          />
        </div>
      ) : null}

      {r.status === "issued" ? (
        <p className="mt-6 text-sm text-muted-foreground">
          รวมจ่าย {r.lines.filter((l) => Number(l.issued ?? 0) > 0).length} รายการ · ยอดในคลังลดตามจำนวน{" "}
          {r.lines.map((l) => `${l.name} ${qty(l.issued)} ${l.unit}`).join(", ")}
        </p>
      ) : null}
    </section>
  );
}
