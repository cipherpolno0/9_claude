import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Attachments } from "@/components/attachments";
import { UseLinesTable } from "@/components/budget-use-summary";
import { InfoText } from "@/components/form";
import { ASSET_CATEGORY_NAMES, USE_STATUS_CLASS, USE_STATUS_LABEL, baht, isUuid, sumMoney } from "@/lib/budget";
import { fetchDisbursementRows, fetchItemDetail, fetchUseDetail } from "@/lib/budget-server";
import { thaiDate, thaiDateTime } from "@/lib/thai";

import { budgetQuery, loadBudgetScope } from "../../scope";
import { UseForm } from "../use-form";
import { AdjustButton, CloseUseButton, DisbursementForm } from "./spend-actions";

export const metadata: Metadata = { title: "คำขอใช้งบประมาณ" };
export const dynamic = "force-dynamic";

export default async function UsePage({
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
  // ฐานข้อมูลตรวจสิทธิ์: ผู้ยื่น หรือผู้มีสิทธิ์ดูงบของหน่วยที่ใช้เงิน
  const u = await fetchUseDetail(id);
  if (!u) notFound();
  const disbursements = await fetchDisbursementRows(u.id);
  const q = budgetQuery(null, { id: u.org_unit_id }, { year: String(u.year_be) });
  const saved = typeof search.saved === "string" ? search.saved : null;
  const canSpend = u.can_edit && u.status === "approved" && u.year_open;
  const outstanding = Number(u.outstanding);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const payments = disbursements.filter((d) => d.kind === "payment");
  const adjustmentsOf = (pid: string) => disbursements.filter((d) => d.adjusts_id === pid);
  const item = u.is_mine && u.status === "returned" ? await fetchItemDetail(u.item_id, u.org_unit_id) : null;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href={`/app/budget/uses?${q}`} className="text-primary underline underline-offset-4">
          ← คำขอใช้งบประมาณ
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">คำขอใช้งบประมาณ {u.request_no ?? ""}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
        <span className={`rounded border px-2 py-0.5 text-sm ${USE_STATUS_CLASS[u.status] ?? ""}`} data-testid="use-status">
          {USE_STATUS_LABEL[u.status] ?? u.status}
        </span>
        ยื่นเมื่อ {thaiDateTime(u.created_at)}
        {u.approved_at ? ` · อนุมัติเมื่อ ${thaiDateTime(u.approved_at)}` : ""}
      </p>
      {saved ? (
        <div className="mt-4">
          <InfoText>{saved}</InfoText>
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border bg-card p-5">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">หน่วยที่ใช้เงิน</dt>
          <dd>{u.unit_name} · ปีงบประมาณ {u.year_be}</dd>
          <dt className="text-muted-foreground">รายการงบประมาณ</dt>
          <dd>
            <Link
              href={`/app/budget/plan/items/${u.item_id}?unit=${u.org_unit_id}`}
              prefetch={false}
              className="text-primary underline underline-offset-4"
            >
              {u.item_path}
            </Link>
          </dd>
          <dt className="text-muted-foreground">วัตถุประสงค์</dt>
          <dd className="whitespace-pre-line">{u.purpose}</dd>
        </dl>
        <UseLinesTable lines={u.lines} total={u.amount} />
        {u.request_id ? (
          <p className="mt-3">
            <Link href={`/app/approvals/${u.request_id}`} className="text-primary underline underline-offset-4">
              ดูสถานะการพิจารณา ความเห็น และแนบเอกสารประกอบ ที่หน้าคำขอ
            </Link>
          </p>
        ) : null}
      </div>

      {u.status === "approved" || u.status === "closed" ? (
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="use-money">
          {[
            ["ผูกพัน (อนุมัติ)", u.committed],
            ["เบิกจ่ายแล้ว", u.disbursed],
            [u.status === "closed" ? "คืนเงินเหลือจ่าย" : "คงค้างเบิก", u.status === "closed" ? u.released : u.outstanding],
            ["งวดที่จ่าย", null],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border bg-card p-4">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{value === null ? `${payments.length} งวด` : baht(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {u.status === "closed" ? (
        <p className="mt-4 rounded-xl border bg-card p-4" data-testid="use-closed">
          ปิดคำขอเมื่อ {thaiDateTime(u.released_at)} คืนเงินเหลือจ่าย {baht(u.released)} บาท กลับเข้ารายการ
          {u.release_reason ? ` (${u.release_reason})` : ""}
        </p>
      ) : null}

      {item ? (
        <div className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="text-xl font-bold text-primary">แก้ไขแล้วส่งใหม่</h2>
          <p className="text-muted-foreground">
            ผู้พิจารณาส่งกลับให้แก้ไข อ่านความเห็นที่หน้าคำขอ จำนวนเงินรวมต้องไม่มากกว่าคำขอเดิม ({baht(u.amount)} บาท) ถ้าต้องการเพิ่ม ให้ยกเลิกแล้วยื่นใหม่
          </p>
          <UseForm
            items={[{ id: item.id, path: item.path, free: Number(item.remaining) }]}
            unitId={u.org_unit_id}
            initialItem={item.id}
            query={q}
            resubmit={{
              id: u.id,
              item: item.id,
              purpose: u.purpose,
              lines: u.lines.map((l) => ({ description: l.description, quantity: String(l.quantity), unit: l.unit, unit_price: String(l.unit_price) })),
              maxAmount: Number(u.amount),
            }}
          />
        </div>
      ) : null}

      {u.status === "approved" || u.status === "closed" ? (
        <div className="mt-6 flex flex-col gap-4">
          <h2 className="text-xl font-bold text-primary">การเบิกจ่าย</h2>
          {payments.length === 0 ? (
            <p className="rounded-xl border bg-card p-5 text-muted-foreground" data-testid="disbursements-empty">
              ยังไม่มีการเบิกจ่าย
            </p>
          ) : (
            payments.map((p) => {
              const adjustments = adjustmentsOf(p.id);
              const net = sumMoney([p.amount, ...adjustments.map((a) => a.amount)]);
              return (
                <article key={p.id} className="rounded-xl border bg-card p-5" data-testid="disbursement">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        งวดที่ {p.installment_no} · {thaiDate(p.paid_on)} · {p.payee}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {p.voucher_no ? `ใบสำคัญ ${p.voucher_no} · ` : ""}บันทึกโดย {p.created_by_name ?? "-"} เมื่อ {thaiDateTime(p.created_at)}
                        {p.note ? ` · ${p.note}` : ""}
                        {p.asset_receipt_ref ? ` · อ้างอิงรายการรับเข้าพัสดุ ${p.asset_receipt_ref}` : ""}
                      </p>
                    </div>
                    <p className="text-right">
                      <span className="block text-xl font-semibold tabular-nums">{baht(p.amount)}</span>
                      {adjustments.length ? <span className="text-sm text-muted-foreground">สุทธิ {baht(net)}</span> : null}
                    </p>
                  </div>
                  {adjustments.length ? (
                    <ul className="mt-3 flex flex-col gap-1 border-l-4 border-amber-300 pl-3 text-sm" data-testid="adjustments">
                      {adjustments.map((a) => (
                        <li key={a.id}>
                          ปรับปรุง {thaiDate(a.paid_on)}: <span className="tabular-nums">{Number(a.amount) > 0 ? "+" : ""}{baht(a.amount)}</span> บาท ·
                          เหตุผล {a.reason} · โดย {a.created_by_name ?? "-"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-sm font-semibold">ใบเสร็จและหลักฐานการจ่าย</p>
                    <Attachments
                      entityTable="budget_disbursements"
                      entityId={p.id}
                      orgUnitId={u.org_unit_id}
                      currentUserId={ctx.user.id}
                      canUpload={u.can_edit}
                      emptyText="ยังไม่มีใบเสร็จ"
                      inputLabel={`แนบใบเสร็จงวดที่ ${p.installment_no}`}
                    />
                  </div>
                  {canSpend ? (
                    <div className="mt-3">
                      <AdjustButton id={p.id} installment={p.installment_no} net={net} />
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
          {canSpend && outstanding > 0 ? (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-3 text-lg font-bold text-primary">บันทึกการเบิกจ่ายงวดใหม่</h3>
              <DisbursementForm
                useId={u.id}
                outstanding={outstanding}
                today={today}
                assetRef={ASSET_CATEGORY_NAMES.includes(u.category_name ?? "")}
              />
            </div>
          ) : null}
          {canSpend ? (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-2 text-lg font-bold text-primary">คืนเงินเหลือจ่าย</h3>
              <p className="mb-3 text-muted-foreground">เมื่อใช้เงินเสร็จแล้ว ให้คืนยอดที่ไม่ได้เบิก ({baht(outstanding)} บาท) กลับเข้ารายการงบประมาณ</p>
              <CloseUseButton id={u.id} outstanding={outstanding} />
            </div>
          ) : null}
          {u.status === "approved" && u.can_edit && !u.year_open ? (
            <p className="text-muted-foreground">ปีงบประมาณ {u.year_be} ปิดแล้ว บันทึกเบิกจ่ายเพิ่มไม่ได้</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
