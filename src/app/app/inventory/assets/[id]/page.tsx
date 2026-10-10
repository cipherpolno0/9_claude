import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Attachments } from "@/components/attachments";
import { InfoText } from "@/components/form";
import { Button } from "@/components/ui/button";
import { assetUrl, qrSvg } from "@/lib/asset-qr";
import { COUNT_RESULT_LABEL, METHOD_LABEL } from "@/lib/assets";
import { fetchAllActiveUnits, fetchAssetDetail, fetchAssetPhotoUrl } from "@/lib/assets-server";
import { requireMenu } from "@/lib/auth/guards";
import { baht, isUuid } from "@/lib/budget";
import { REQUEST_STATUS_LABEL } from "@/lib/requests/labels";
import { createClient } from "@/lib/supabase/server";
import { thaiDate } from "@/lib/thai";

import { ConditionBadge } from "../../ui";
import {
  ActiveToggle,
  CancelWithReason,
  CountButtons,
  DisposalForm,
  LendForm,
  ReceiveTransferForm,
  RepairForm,
  ReturnForm,
  SendTransferForm,
} from "../asset-forms";

export const metadata: Metadata = { title: "ครุภัณฑ์" };
export const dynamic = "force-dynamic";

const TRANSFER_LABEL = { sent: "รอรับ", received: "รับแล้ว", cancelled: "ยกเลิก" } as const;

/** หน้าครุภัณฑ์ (ปลายทางของป้าย QR): ข้อมูล ค่าเสื่อม ตรวจนับ โอน ยืม-คืน ซ่อม จำหน่าย รูปถ่าย */
export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireMenu("/app/inventory");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const a = await fetchAssetDetail(id);
  if (!a) notFound();
  const saved = (await searchParams).saved;
  const pending = a.transfers.find((t) => t.status === "sent") ?? null;
  const openLoan = a.loans.find((l) => !l.returned_on) ?? null;
  const openCounts = a.counts.filter((c) => c.status === "open" && c.can_record);
  const movable = a.can_edit && (a.condition === "usable" || a.condition === "damaged") && !pending && !openLoan;
  const [photo, svg, units] = await Promise.all([
    fetchAssetPhotoUrl(a.id),
    assetUrl(a.id).then(qrSvg),
    movable ? fetchAllActiveUnits() : Promise.resolve([]),
  ]);
  let disposalReason = "";
  if (a.disposal && a.disposal.status === "returned" && a.disposal.requester_id === ctx.user.id) {
    const supabase = await createClient();
    const { data } = await supabase.from("requests").select("payload").eq("id", a.disposal.request_id).maybeSingle();
    disposalReason = String((data?.payload as { detail?: string } | undefined)?.detail ?? "");
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <p className="text-sm">
        <Link href="/app/inventory/assets" className="text-primary underline underline-offset-4">
          ← ทะเบียนครุภัณฑ์
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-bold text-primary sm:text-3xl">
        {a.asset_no} {a.name}
      </h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
        <ConditionBadge condition={a.condition} />
        {a.unit_name}
        {a.disposed_on ? ` · จำหน่ายเมื่อ ${thaiDate(a.disposed_on)}` : ""}
        {!a.is_active ? <span className="font-semibold text-destructive">ปิดใช้งาน</span> : null}
      </p>
      {typeof saved === "string" ? (
        <div className="mt-4">
          <InfoText>{saved}</InfoText>
        </div>
      ) : null}

      {openCounts.map((c) => (
        <div key={c.count_id} className="mt-6 rounded-xl border-2 border-ring bg-card p-4 sm:p-5" data-testid="count-box">
          <h2 className="text-xl font-bold text-primary">ตรวจนับ: {c.title}</h2>
          <p className="mb-3 text-muted-foreground">
            ผลตอนนี้: {c.result ? COUNT_RESULT_LABEL[c.result] : "ยังไม่ตรวจ"} · กดผลที่พบจริง
          </p>
          <CountButtons countId={c.count_id} assetId={a.id} current={c.result} />
        </div>
      ))}

      {pending?.can_receive ? (
        <div className="mt-6 rounded-xl border-2 border-ring bg-card p-4 sm:p-5">
          <h2 className="text-xl font-bold text-primary">รับครุภัณฑ์โอนจาก{pending.from_unit_name}</h2>
          <p className="mb-3 text-muted-foreground">
            โอนวันที่ {thaiDate(pending.sent_on)} โดย {pending.created_by_name}
            {pending.note ? ` · ${pending.note}` : ""}
          </p>
          <ReceiveTransferForm id={pending.id} location="" custodian="" />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_auto] sm:p-5">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- ลิงก์ชั่วคราวจากที่เก็บไฟล์ส่วนตัว
            <img src={photo} alt={`รูป${a.name}`} className="size-32 shrink-0 rounded-lg border object-cover" data-testid="asset-photo" />
          ) : null}
          <dl className="grid min-w-0 gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]" data-testid="asset-info">
            <dt className="text-muted-foreground">ประเภท</dt>
            <dd>{a.type_name}</dd>
            <dt className="text-muted-foreground">ยี่ห้อ / รุ่น / หมายเลขเครื่อง</dt>
            <dd>{[a.brand, a.model, a.serial_no].filter(Boolean).join(" / ") || "-"}</dd>
            <dt className="text-muted-foreground">วันที่ได้มา</dt>
            <dd>
              {thaiDate(a.acquired_on)} ({METHOD_LABEL[a.acquire_method]})
            </dd>
            <dt className="text-muted-foreground">ราคา</dt>
            <dd>
              {baht(a.price)} บาท{a.source_name ? ` · ${a.source_name}` : ""}
            </dd>
            <dt className="text-muted-foreground">อายุการใช้งาน</dt>
            <dd>
              {a.life_years} ปี{a.useful_life_years ? " (กำหนดเฉพาะรายการ)" : " (ตามประเภท)"}
            </dd>
            <dt className="text-muted-foreground">ค่าเสื่อมสะสม ณ วันนี้</dt>
            <dd data-testid="asset-acc">{baht(a.acc_dep)} บาท</dd>
            <dt className="text-muted-foreground">มูลค่าสุทธิ ณ วันนี้</dt>
            <dd data-testid="asset-net">{baht(a.net_value)} บาท</dd>
            <dt className="text-muted-foreground">สถานที่ตั้ง</dt>
            <dd>{a.location || "-"}</dd>
            <dt className="text-muted-foreground">ผู้รับผิดชอบ</dt>
            <dd>{a.custodian || "-"}</dd>
            {a.note ? (
              <>
                <dt className="text-muted-foreground">หมายเหตุ</dt>
                <dd>{a.note}</dd>
              </>
            ) : null}
          </dl>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="size-32 bg-white p-1" role="img" aria-label="ป้าย QR ของครุภัณฑ์นี้" dangerouslySetInnerHTML={{ __html: svg }} />
          <Button asChild variant="outline" size="sm">
            <a href={`/app/inventory/assets/labels?ids=${a.id}`} target="_blank" rel="noopener">
              พิมพ์ป้าย QR
            </a>
          </Button>
        </div>
      </div>

      {a.can_edit ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/app/inventory/assets/${a.id}/edit`}>แก้ไขข้อมูล</Link>
          </Button>
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-xl font-bold text-primary">ค่าเสื่อมราคารายปีงบประมาณ</h2>
        <p className="text-sm text-muted-foreground">เส้นตรงตามจำนวนวันจริง เหลือมูลค่าซาก 1 บาท ปีปัจจุบันแสดงยอดเต็มปี (ถึง 30 ก.ย.)</p>
        <div className="relative mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left" data-testid="depreciation-schedule">
            <thead className="bg-secondary">
              <tr>
                <th scope="col" className="px-3 py-2">ปีงบประมาณ</th>
                <th scope="col" className="px-3 py-2 text-right">สะสมต้นปี</th>
                <th scope="col" className="px-3 py-2 text-right">ค่าเสื่อมประจำปี</th>
                <th scope="col" className="px-3 py-2 text-right">สะสมสิ้นปี</th>
                <th scope="col" className="px-3 py-2 text-right">มูลค่าสุทธิสิ้นปี</th>
              </tr>
            </thead>
            <tbody>
              {a.schedule.map((s) => (
                <tr key={s.year_be} className="border-t">
                  <td className="px-3 py-2">{s.year_be}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(s.opening)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(s.depreciation)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(s.closing)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{baht(s.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-xl font-bold text-primary">โอนย้ายระหว่างหน่วย</h2>
        {a.transfers.length === 0 ? <p className="mt-2 text-muted-foreground">ยังไม่เคยโอน</p> : null}
        <ul className="mt-2 flex flex-col gap-2" data-testid="asset-transfers">
          {a.transfers.map((t) => (
            <li key={t.id} className="rounded-lg border p-3">
              <p>
                <strong>{TRANSFER_LABEL[t.status]}</strong> · {t.from_unit_name} → {t.to_unit_name} · โอน {thaiDate(t.sent_on, "short")}
                {t.received_on ? ` · รับ ${thaiDate(t.received_on, "short")} โดย ${t.received_by_name ?? ""}` : ""}
              </p>
              {t.note ? <p className="text-sm text-muted-foreground">{t.note}</p> : null}
              {t.cancel_reason ? <p className="text-sm text-muted-foreground">ยกเลิก: {t.cancel_reason}</p> : null}
              {t.can_cancel ? (
                <div className="mt-2">
                  <CancelWithReason id={t.id} kind="transfer" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {movable ? (
<details className="mt-4 rounded-lg border p-3" data-testid="open-transfer">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-primary">โอนไปหน่วยอื่น</summary>
            <div className="mt-3">
              <SendTransferForm assetId={a.id} units={units} />
            </div>
          </details>
        ) : null}
      </div>

      <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-xl font-bold text-primary">ยืม-คืน</h2>
        {a.loans.length === 0 ? <p className="mt-2 text-muted-foreground">ยังไม่เคยมีการยืม</p> : null}
        <ul className="mt-2 flex flex-col gap-2" data-testid="asset-loans">
          {a.loans.map((l) => (
            <li key={l.id} className="rounded-lg border p-3">
              <p>
                <strong>{l.borrower}</strong> · ยืม {thaiDate(l.loaned_on, "short")}
                {l.due_on ? ` · กำหนดคืน ${thaiDate(l.due_on, "short")}` : ""}
                {l.returned_on ? ` · คืนแล้ว ${thaiDate(l.returned_on, "short")}` : ""}
                {l.overdue ? <span className="ml-2 rounded border border-destructive px-1.5 text-sm text-destructive">เกินกำหนด</span> : null}
              </p>
              {l.note || l.return_note ? <p className="text-sm text-muted-foreground">{[l.note, l.return_note].filter(Boolean).join(" · ")}</p> : null}
              {!l.returned_on && a.can_edit ? (
                <div className="mt-3">
                  <ReturnForm loanId={l.id} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {movable ? (
<details className="mt-4 rounded-lg border p-3" data-testid="open-lend">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-primary">บันทึกการยืม</summary>
            <div className="mt-3">
              <LendForm assetId={a.id} />
            </div>
          </details>
        ) : null}
      </div>

      <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-xl font-bold text-primary">ซ่อมบำรุง</h2>
        <p className="text-sm text-muted-foreground">ค่าใช้จ่ายรวม {baht(a.repair_total)} บาท</p>
        <ul className="mt-2 flex flex-col gap-2" data-testid="asset-repairs">
          {a.repairs.map((r) => (
            <li key={r.id} className={`rounded-lg border p-3 ${r.is_active ? "" : "opacity-60"}`}>
              <p>
                {thaiDate(r.repaired_on, "short")} · {r.description} · {baht(r.cost)} บาท{r.vendor ? ` · ${r.vendor}` : ""}
                {!r.is_active ? ` (ยกเลิก: ${r.cancel_reason})` : ""}
              </p>
              {r.is_active && a.can_edit ? (
                <div className="mt-2">
                  <CancelWithReason id={r.id} kind="repair" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {a.can_edit ? (
<details className="mt-4 rounded-lg border p-3" data-testid="open-repair">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-primary">บันทึกการซ่อม</summary>
            <div className="mt-3">
              <RepairForm assetId={a.id} />
            </div>
          </details>
        ) : null}
      </div>

      <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-xl font-bold text-primary">จำหน่าย</h2>
        {a.disposal ? (
          <p className="mt-2" data-testid="asset-disposal">
            คำขอ{" "}
            <Link href={`/app/approvals/${a.disposal.request_id}`} className="text-primary underline underline-offset-4">
              {a.disposal.request_no}
            </Link>{" "}
            · {REQUEST_STATUS_LABEL[a.disposal.status as keyof typeof REQUEST_STATUS_LABEL] ?? a.disposal.status}
          </p>
        ) : (
          <p className="mt-2 text-muted-foreground">ยังไม่มีคำขอจำหน่าย</p>
        )}
        {disposalReason || (a.disposal?.status === "returned" && a.disposal.requester_id === ctx.user.id) ? (
          <div className="mt-3">
            <h3 className="mb-2 font-semibold">แก้เหตุผลแล้วส่งใหม่</h3>
            <DisposalForm assetId={a.id} resubmit={{ requestId: a.disposal!.request_id, reason: disposalReason }} />
          </div>
        ) : movable ? (
<details className="mt-4 rounded-lg border p-3" data-testid="open-disposal">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-primary">ยื่นคำขอจำหน่าย</summary>
            <div className="mt-3">
              <DisposalForm assetId={a.id} />
            </div>
          </details>
        ) : null}
      </div>

      <div className="mt-6 rounded-xl border bg-card p-4 sm:p-5">
        <h2 className="text-xl font-bold text-primary">รูปถ่าย</h2>
        <div className="mt-3">
          <Attachments
            entityTable="assets"
            entityId={a.id}
            orgUnitId={a.org_unit_id}
            currentUserId={ctx.user.id}
            canUpload={a.can_edit}
            refreshOnChange
            inputLabel="แนบรูปครุภัณฑ์"
          />
        </div>
      </div>

      {a.can_edit || (!a.is_active && a.can_view_unit && ctx.canEditInventory) ? (
        <div className="mt-6">
          <ActiveToggle id={a.id} active={a.is_active} />
        </div>
      ) : null}
    </section>
  );
}
