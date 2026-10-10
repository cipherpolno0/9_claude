"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText, selectClass } from "@/components/form";
import { OrgUnitPicker } from "@/components/org-unit-picker";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AssetType, SourceOption } from "@/lib/assets";
import { todayIso } from "@/lib/inventory";
import type { AccessibleOrgUnit } from "@/lib/org-units-server";

import {
  addRepair,
  cancelAssetTransfer,
  cancelRepair,
  lendAsset,
  receiveAssetTransfer,
  recordCount,
  resubmitDisposal,
  returnAsset,
  saveAsset,
  saveAssetType,
  sendAssetTransfer,
  setAssetActive,
  submitDisposal,
  type AssetInput,
} from "./actions";

const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type Result = { ok: boolean; message?: string; error?: string; id?: string };

/** สถานะของฟอร์มเล็ก: ส่ง > แสดงผล > โหลดหน้าใหม่ */
function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) => {
    setError(null);
    setFlash(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        setFlash(r.message ?? "บันทึกแล้ว");
        after?.(r);
        router.refresh();
      } else setError(r.error ?? "บันทึกไม่สำเร็จ");
    });
  };
  return { error, setError, flash, pending, run, router };
}

function Messages({ error, flash }: { error: string | null; flash: string | null }) {
  return (
    <>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
    </>
  );
}

const fd = (f: FormData, k: string) => String(f.get(k) ?? "");

/** เลือกหน่วย: ส่วนกลาง (ช่องติ๊ก) หรือไล่ชั้นด้วย OrgUnitPicker */
function UnitChoice({ units, name, label, autoSelect = true }: { units: AccessibleOrgUnit[]; name: string; label: string; autoSelect?: boolean }) {
  const central = units.find((u) => u.level === "central" && u.selectable);
  const [atCentral, setAtCentral] = useState(false);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">
        {label}
        <span className="text-destructive"> *</span>
      </legend>
      {central ? (
        <label className="flex h-11 items-center gap-2">
          <input type="checkbox" checked={atCentral} onChange={(e) => setAtCentral(e.target.checked)} className="size-5" />
          ส่วนกลาง
        </label>
      ) : null}
      {atCentral && central ? <input type="hidden" name={name} value={central.id} /> : <OrgUnitPicker units={units} name={name} required autoSelect={autoSelect} />}
    </fieldset>
  );
}

/** เพิ่มหรือแก้ไขครุภัณฑ์ (หน่วยที่ครอบครองเลือกได้เฉพาะตอนเพิ่ม ภายหลังเปลี่ยนด้วยการโอน) */
export function AssetForm({
  types,
  sources,
  units,
  asset,
}: {
  types: AssetType[];
  sources: SourceOption[];
  units: AccessibleOrgUnit[];
  asset?: Omit<AssetInput, "orgUnitId"> & { id: string; unitName: string };
}) {
  const { error, setError, flash, pending, run, router } = useRun();
  const [typeId, setTypeId] = useState(asset?.typeId ?? "");
  const typeLife = types.find((t) => t.id === typeId)?.useful_life_years;
  return (
    <form
      className="flex flex-col gap-4"
      data-testid="asset-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("acquired_on_incomplete")) return setError("กรุณากรอกวันที่ได้มาให้ครบ");
        run(
          () =>
            saveAsset({
              id: asset?.id ?? null,
              assetNo: fd(f, "asset_no"),
              name: fd(f, "name"),
              typeId,
              brand: fd(f, "brand"),
              model: fd(f, "model"),
              serialNo: fd(f, "serial_no"),
              acquiredOn: fd(f, "acquired_on"),
              method: fd(f, "method"),
              price: fd(f, "price"),
              sourceId: fd(f, "source_id"),
              lifeYears: fd(f, "life"),
              orgUnitId: fd(f, "org_unit_id"),
              location: fd(f, "location"),
              custodian: fd(f, "custodian"),
              condition: fd(f, "condition"),
              note: fd(f, "note"),
            }),
          (r) => {
            if (r.id) router.push(`/app/inventory/assets/${r.id}?saved=${encodeURIComponent(r.message ?? "")}`);
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="as-no">
            เลขครุภัณฑ์<span className="text-destructive"> *</span>
          </Label>
          <Input id="as-no" name="asset_no" defaultValue={asset?.assetNo} maxLength={60} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="as-name">
            ชื่อครุภัณฑ์<span className="text-destructive"> *</span>
          </Label>
          <Input id="as-name" name="name" defaultValue={asset?.name} maxLength={200} required />
        </div>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">เลขครุภัณฑ์กรอกตามรูปแบบที่หน่วยงานใช้ ห้ามซ้ำทั้งระบบ</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="as-type">
            ประเภท<span className="text-destructive"> *</span>
          </Label>
          <select id="as-type" className={selectClass} value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
            <option value="">เลือกประเภท</option>
            {types.map((t) => (
              <option key={t.id} value={t.id} disabled={!t.is_active && t.id !== asset?.typeId}>
                {t.name} ({t.useful_life_years} ปี)
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="as-life">อายุการใช้งาน (ปี)</Label>
          <Input id="as-life" name="life" inputMode="numeric" defaultValue={asset?.lifeYears} placeholder={typeLife ? `ตามประเภท ${typeLife} ปี` : "ตามประเภท"} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="as-condition">สภาพ</Label>
          <select id="as-condition" name="condition" className={selectClass} defaultValue={asset?.condition ?? "usable"}>
            <option value="usable">ใช้งานได้</option>
            <option value="damaged">ชำรุด</option>
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="as-brand">ยี่ห้อ</Label>
          <Input id="as-brand" name="brand" defaultValue={asset?.brand} maxLength={100} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="as-model">รุ่น</Label>
          <Input id="as-model" name="model" defaultValue={asset?.model} maxLength={100} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="as-serial">หมายเลขเครื่อง</Label>
          <Input id="as-serial" name="serial_no" defaultValue={asset?.serialNo} maxLength={100} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ThaiDateInput label="วันที่ได้มา" name="acquired_on" defaultValue={asset?.acquiredOn ?? todayIso()} required />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="as-method">วิธีได้มา</Label>
            <select id="as-method" name="method" className={selectClass} defaultValue={asset?.method ?? "purchase"}>
              <option value="purchase">ซื้อ</option>
              <option value="donation">บริจาค</option>
              <option value="transfer">โอน</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="as-price">
              ราคา (บาท)<span className="text-destructive"> *</span>
            </Label>
            <Input id="as-price" name="price" inputMode="decimal" defaultValue={asset?.price} required />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1 sm:max-w-md">
        <Label htmlFor="as-source">แหล่งเงิน</Label>
        <select id="as-source" name="source_id" className={selectClass} defaultValue={asset?.sourceId ?? ""}>
          <option value="">ไม่ระบุ</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id} disabled={!s.is_active && s.id !== asset?.sourceId}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {asset ? (
        <p>
          หน่วยที่ครอบครอง: <strong>{asset.unitName}</strong> <span className="text-sm text-muted-foreground">(เปลี่ยนด้วยการโอนที่หน้าครุภัณฑ์)</span>
        </p>
      ) : (
        <UnitChoice units={units} name="org_unit_id" label="หน่วยที่ครอบครอง" />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="as-location">สถานที่ตั้ง</Label>
          <Input id="as-location" name="location" defaultValue={asset?.location} maxLength={200} placeholder="เช่น ห้องธุรการ อาคาร 1" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="as-custodian">ผู้รับผิดชอบ</Label>
          <Input id="as-custodian" name="custodian" defaultValue={asset?.custodian} maxLength={200} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="as-note">หมายเหตุ</Label>
        <Input id="as-note" name="note" defaultValue={asset?.note} maxLength={500} />
      </div>
      <p className="text-sm text-muted-foreground">
        ค่าเสื่อมราคาคำนวณอัตโนมัติแบบเส้นตรงตามจำนวนวันจริงตั้งแต่วันที่ได้มา เหลือมูลค่าซาก 1 บาท รูปถ่ายแนบได้ที่หน้าครุภัณฑ์หลังบันทึก
      </p>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : asset ? "บันทึกการแก้ไข" : "เพิ่มครุภัณฑ์"}
        </Button>
      </div>
    </form>
  );
}

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const { error, flash, pending, run } = useRun();
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (active && !window.confirm("ปิดใช้งานครุภัณฑ์นี้ (ใช้เมื่อบันทึกผิด) ใช่หรือไม่")) return;
          run(() => setAssetActive(id, !active));
        }}
      >
        {active ? "ปิดใช้งาน (บันทึกผิด)" : "เปิดใช้งานคืน"}
      </Button>
      <Messages error={error} flash={flash} />
    </div>
  );
}

/** ปุ่มบันทึกผลตรวจนับ (หน้าที่เปิดจากการสแกน QR และหน้ารอบตรวจนับ) */
export function CountButtons({ countId, assetId, current, compact = false }: { countId: string; assetId: string; current: string | null; compact?: boolean }) {
  const { error, flash, pending, run } = useRun();
  return (
    <div className="flex flex-col gap-2" data-testid={`count-buttons-${assetId}`}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size={compact ? "sm" : "default"} variant={current === "found" ? "default" : "outline"} disabled={pending}
          onClick={() => run(() => recordCount(countId, assetId, "found"))}>
          พบ
        </Button>
        <Button type="button" size={compact ? "sm" : "default"} variant={current === "damaged" ? "default" : "outline"} disabled={pending}
          onClick={() => run(() => recordCount(countId, assetId, "damaged"))}>
          ชำรุด
        </Button>
      </div>
      {compact ? <ErrorText>{error}</ErrorText> : <Messages error={error} flash={flash} />}
    </div>
  );
}

export function SendTransferForm({ assetId, units }: { assetId: string; units: AccessibleOrgUnit[] }) {
  const { error, setError, flash, pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="send-transfer-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("sent_on_incomplete")) return setError("กรุณากรอกวันที่โอนให้ครบ");
        run(() => sendAssetTransfer(assetId, fd(f, "to_unit"), fd(f, "sent_on"), fd(f, "note")));
      }}
    >
      <UnitChoice units={units} name="to_unit" label="หน่วยปลายทาง" autoSelect={false} />
      <div className="grid gap-3 sm:grid-cols-2">
        <ThaiDateInput label="วันที่โอน" name="sent_on" defaultValue={todayIso()} required />
        <div className="flex flex-col gap-1">
          <Label htmlFor="tr-note">หมายเหตุ</Label>
          <Input id="tr-note" name="note" maxLength={500} />
        </div>
      </div>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "บันทึกโอน"}
        </Button>
      </div>
    </form>
  );
}

export function ReceiveTransferForm({ id, location, custodian }: { id: string; location: string; custodian: string }) {
  const { error, setError, flash, pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="receive-asset-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("received_on_incomplete")) return setError("กรุณากรอกวันที่รับให้ครบ");
        run(() => receiveAssetTransfer(id, fd(f, "received_on"), fd(f, "location"), fd(f, "custodian")));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <ThaiDateInput label="วันที่รับ" name="received_on" defaultValue={todayIso()} required />
        <div className="flex flex-col gap-1">
          <Label htmlFor="rv-location">สถานที่ตั้งใหม่</Label>
          <Input id="rv-location" name="location" defaultValue={location} maxLength={200} />
          <Label htmlFor="rv-custodian" className="mt-2">
            ผู้รับผิดชอบใหม่
          </Label>
          <Input id="rv-custodian" name="custodian" defaultValue={custodian} maxLength={200} />
        </div>
      </div>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "รับเข้าหน่วย"}
        </Button>
      </div>
    </form>
  );
}

/** ยกเลิก (การโอนหรือรายการซ่อม) พร้อมเหตุผล */
export function CancelWithReason({ id, kind }: { id: string; kind: "transfer" | "repair" }) {
  const { error, flash, pending, run } = useRun();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {kind === "transfer" ? "ยกเลิกการโอน" : "ยกเลิกรายการ"}
      </Button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => (kind === "transfer" ? cancelAssetTransfer(id, reason) : cancelRepair(id, reason)));
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label htmlFor={`cancel-${id}`}>เหตุผลที่ยกเลิก</Label>
        <Input id={`cancel-${id}`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} required />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        ยืนยันยกเลิก
      </Button>
      <div className="w-full">
        <Messages error={error} flash={flash} />
      </div>
    </form>
  );
}

export function LendForm({ assetId }: { assetId: string }) {
  const { error, setError, flash, pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="lend-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        if (f.get("loaned_on_incomplete") || f.get("due_on_incomplete")) return setError("กรุณากรอกวันที่ให้ครบ");
        run(() => lendAsset(assetId, fd(f, "borrower"), fd(f, "loaned_on"), fd(f, "due_on"), fd(f, "note")), () => form.reset());
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ln-borrower">
            ผู้ยืม (ชื่อหรือหน่วยงาน)<span className="text-destructive"> *</span>
          </Label>
          <Input id="ln-borrower" name="borrower" maxLength={200} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ln-note">วัตถุประสงค์ / หมายเหตุ</Label>
          <Input id="ln-note" name="note" maxLength={500} />
        </div>
        <ThaiDateInput label="วันที่ยืม" name="loaned_on" defaultValue={todayIso()} required />
        <ThaiDateInput label="กำหนดคืน (ถ้ามี)" name="due_on" />
      </div>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          บันทึกการยืม
        </Button>
      </div>
    </form>
  );
}

export function ReturnForm({ loanId }: { loanId: string }) {
  const { error, setError, flash, pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="return-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("returned_on_incomplete")) return setError("กรุณากรอกวันที่คืนให้ครบ");
        run(() => returnAsset(loanId, fd(f, "returned_on"), fd(f, "return_note")));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <ThaiDateInput label="วันที่คืน" name="returned_on" defaultValue={todayIso()} required />
        <div className="flex flex-col gap-1">
          <Label htmlFor="rt-note">สภาพตอนคืน / หมายเหตุ</Label>
          <Input id="rt-note" name="return_note" maxLength={500} />
        </div>
      </div>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" disabled={pending}>
          บันทึกการคืน
        </Button>
      </div>
    </form>
  );
}

export function RepairForm({ assetId }: { assetId: string }) {
  const { error, setError, flash, pending, run } = useRun();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="repair-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        if (f.get("repaired_on_incomplete")) return setError("กรุณากรอกวันที่ให้ครบ");
        run(() => addRepair(assetId, fd(f, "repaired_on"), fd(f, "description"), fd(f, "cost"), fd(f, "vendor")), () => form.reset());
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <ThaiDateInput label="วันที่ซ่อม" name="repaired_on" defaultValue={todayIso()} required />
        <div className="flex flex-col gap-1">
          <Label htmlFor="rp-desc">
            รายการซ่อม<span className="text-destructive"> *</span>
          </Label>
          <Input id="rp-desc" name="description" maxLength={500} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rp-cost">ค่าใช้จ่าย (บาท)</Label>
          <Input id="rp-cost" name="cost" inputMode="decimal" defaultValue="0" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rp-vendor">ผู้ซ่อม / ร้าน</Label>
          <Input id="rp-vendor" name="vendor" maxLength={200} />
        </div>
      </div>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          บันทึกการซ่อม
        </Button>
      </div>
    </form>
  );
}

/** ยื่นคำขอจำหน่าย หรือแก้เหตุผลแล้วส่งใหม่ (คำขอถูกส่งกลับ) */
export function DisposalForm({ assetId, resubmit }: { assetId: string; resubmit?: { requestId: string; reason: string } }) {
  const { error, flash, pending, run, router } = useRun();
  const [reason, setReason] = useState(resubmit?.reason ?? "");
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="disposal-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (resubmit) return run(() => resubmitDisposal(resubmit.requestId, reason));
        run(() => submitDisposal(assetId, reason), (r) => {
          if (r.id) router.push(`/app/approvals/${r.id}`);
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="dsp-reason">
          เหตุผลที่ขอจำหน่าย<span className="text-destructive"> *</span>
        </Label>
        <textarea id="dsp-reason" className={textareaClass} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} required />
      </div>
      <p className="text-sm text-muted-foreground">
        ยื่นแล้วสภาพเป็น รอจำหน่าย แนบรูปถ่ายประกอบที่หน้าคำขอ ผู้อนุมัติคือเจ้าคณะหรือรองเจ้าคณะของหน่วยที่ครอบครอง (ส่วนกลาง = เจ้าหน้าที่ส่วนกลาง)
      </p>
      <Messages error={error} flash={flash} />
      <div>
        <Button type="submit" variant={resubmit ? "default" : "outline"} disabled={pending}>
          {pending ? "กำลังส่ง..." : resubmit ? "แก้แล้วส่งใหม่" : "ยื่นคำขอจำหน่าย"}
        </Button>
      </div>
    </form>
  );
}

/** ประเภทครุภัณฑ์และอายุการใช้งาน (ผู้ดูแลระบบ) */
export function AssetTypeForm({ t }: { t?: AssetType }) {
  const { error, flash, pending, run } = useRun();
  const key = t?.id ?? "new";
  return (
    <form
      className="flex flex-col gap-2"
      data-testid={t ? `asset-type-${t.id}` : "new-asset-type-form"}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        run(
          () => saveAssetType({ id: t?.id ?? null, name: fd(f, "name"), life: fd(f, "life"), sortOrder: fd(f, "sort_order"), isActive: t ? f.get("is_active") === "1" : true }),
          t ? undefined : () => form.reset(),
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor={`at-${key}-name`}>{t ? "ชื่อประเภท" : "ชื่อประเภทใหม่"}</Label>
          <Input id={`at-${key}-name`} name="name" defaultValue={t?.name} maxLength={100} required />
        </div>
        <div className="flex w-28 flex-col gap-1">
          <Label htmlFor={`at-${key}-life`}>อายุ (ปี)</Label>
          <Input id={`at-${key}-life`} name="life" inputMode="numeric" defaultValue={t?.useful_life_years} required />
        </div>
        <div className="flex w-20 flex-col gap-1">
          <Label htmlFor={`at-${key}-sort`}>ลำดับ</Label>
          <Input id={`at-${key}-sort`} name="sort_order" inputMode="numeric" defaultValue={t?.sort_order ?? 0} />
        </div>
        {t ? (
          <label className="flex h-11 items-center gap-2">
            <input type="checkbox" name="is_active" value="1" defaultChecked={t.is_active} className="size-5" />
            ใช้งาน
          </label>
        ) : null}
        <Button type="submit" variant={t ? "outline" : "default"} disabled={pending}>
          {t ? "บันทึก" : "เพิ่มประเภท"}
        </Button>
      </div>
      <Messages error={error} flash={flash} />
    </form>
  );
}
