"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ErrorText, InfoText, selectClass } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { baht } from "@/lib/budget";
import { parseQty, qty, todayIso, type DisbursementOption, type ItemOption } from "@/lib/inventory";

import { receiveStock, resubmitRequisition, sendTransfer, submitRequisition, type LineInput } from "./actions";

type Row = { key: number; item_id: string; quantity: string; unit_price: string };

export const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const emptyRow = (key: number): Row => ({ key, item_id: "", quantity: "", unit_price: "" });

/** ตัวเลือกวัสดุแบ่งกลุ่มตามหมวด */
function ItemSelect({ id, value, options, onChange, taken }: { id: string; value: string; options: ItemOption[]; onChange: (v: string) => void; taken: Set<string> }) {
  const groups = new Map<string, ItemOption[]>();
  for (const o of options) {
    const g = o.category ?? "ไม่ระบุหมวด";
    groups.set(g, [...(groups.get(g) ?? []), o]);
  }
  return (
    <select id={id} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">เลือกวัสดุ</option>
      {[...groups.entries()].map(([g, items]) => (
        <optgroup key={g} label={g}>
          {items.map((o) => (
            <option key={o.id} value={o.id} disabled={taken.has(o.id) && o.id !== value}>
              {o.code} {o.name} (คงเหลือ {qty(o.balance)} {o.unit})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** รายการวัสดุหลายบรรทัด (ใช้ร่วมกันทั้งรับเข้า ใบเบิก และโอน) */
function LinesEditor({
  options,
  rows,
  setRows,
  nextKey,
  withPrice = false,
  checkBalance = false,
  legend,
}: {
  options: ItemOption[];
  rows: Row[];
  setRows: React.Dispatch<React.SetStateAction<Row[]>>;
  nextKey: React.RefObject<number>;
  withPrice?: boolean;
  /** เตือนเมื่อจำนวนเกินยอดคงเหลือ */
  checkBalance?: boolean;
  legend: string;
}) {
  const byId = new Map(options.map((o) => [o.id, o]));
  const taken = new Set(rows.map((r) => r.item_id).filter(Boolean));
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const total = withPrice
    ? rows.reduce((s, r) => {
        const q = Number(parseQty(r.quantity) ?? 0);
        const p = Number(parseQty(r.unit_price) ?? 0);
        return Math.round((s + q * p) * 100) / 100;
      }, 0)
    : 0;
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 font-semibold">
        {legend}
        <span className="text-destructive"> *</span>
      </legend>
      {options.length === 0 ? <p className="text-muted-foreground">ยังไม่มีวัสดุในทะเบียน ให้เพิ่มที่ ตั้งค่า &gt; วัสดุ ก่อน</p> : null}
      {rows.map((r, i) => {
        const item = byId.get(r.item_id);
        const q = parseQty(r.quantity);
        const over = checkBalance && item && q !== null && Number(q) > item.balance;
        return (
          <div
            key={r.key}
            className={`grid gap-2 rounded-lg border p-3 ${withPrice ? "sm:grid-cols-[3fr_1fr_1fr_auto]" : "sm:grid-cols-[3fr_1fr_auto]"} sm:items-end`}
            data-testid="stock-line"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor={`ln${r.key}-item`}>รายการที่ {i + 1}</Label>
              <ItemSelect id={`ln${r.key}-item`} value={r.item_id} options={options} taken={taken} onChange={(v) => update(r.key, { item_id: v })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`ln${r.key}-qty`}>จำนวน{item ? ` (${item.unit})` : ""}</Label>
              <Input id={`ln${r.key}-qty`} inputMode="decimal" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} />
            </div>
            {withPrice ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`ln${r.key}-price`}>ราคาต่อหน่วย (บาท)</Label>
                <Input id={`ln${r.key}-price`} inputMode="decimal" value={r.unit_price} onChange={(e) => update(r.key, { unit_price: e.target.value })} />
              </div>
            ) : null}
            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11"
                disabled={rows.length === 1}
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              >
                <Trash2 aria-hidden />
                <span className="sr-only">ลบรายการที่ {i + 1}</span>
              </Button>
            </div>
            {over ? (
              <p className="text-sm text-amber-800 sm:col-span-full" data-testid="over-balance">
                เกินยอดคงเหลือ ({qty(item.balance)} {item.unit})
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" disabled={rows.length >= 100} onClick={() => setRows((rs) => [...rs, emptyRow(nextKey.current++)])}>
          <Plus aria-hidden />
          เพิ่มรายการ
        </Button>
        {withPrice ? (
          <p className="text-lg font-semibold" aria-live="polite">
            มูลค่ารวม <span data-testid="receive-total" className="tabular-nums">{baht(total)}</span> บาท
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}

const toInput = (rows: Row[], withPrice = false): LineInput[] =>
  rows.map((r) => (withPrice ? { item_id: r.item_id, quantity: r.quantity, unit_price: r.unit_price } : { item_id: r.item_id, quantity: r.quantity }));

/** ยื่นใบเบิก หรือแก้แล้วส่งใหม่เมื่อถูกส่งกลับ */
export function RequisitionForm({
  warehouse,
  options,
  resubmit,
}: {
  warehouse: { id: string; name: string };
  options: ItemOption[];
  resubmit?: { id: string; purpose: string; lines: { item_id: string; quantity: string }[] };
}) {
  const router = useRouter();
  const [purpose, setPurpose] = useState(resubmit?.purpose ?? "");
  const [rows, setRows] = useState<Row[]>(
    resubmit?.lines.length ? resubmit.lines.map((l, i) => ({ key: i, item_id: l.item_id, quantity: l.quantity, unit_price: "" })) : [emptyRow(0)],
  );
  const nextKey = useRef(rows.length);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
      data-testid="requisition-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setFlash(null);
        startTransition(async () => {
          if (resubmit) {
            const r = await resubmitRequisition(resubmit.id, purpose, toInput(rows));
            if (r.ok) {
              setFlash(r.message ?? null);
              router.refresh();
            } else setError(r.error);
            return;
          }
          const r = await submitRequisition({ warehouse: warehouse.id, purpose, lines: toInput(rows) });
          if (r.ok && r.id) router.push(`/app/inventory/requisitions/${r.id}?saved=${encodeURIComponent(r.message ?? "")}`);
          else if (!r.ok) setError(r.error);
        });
      }}
    >
      <p>
        เบิกจาก <strong>{warehouse.name}</strong>
      </p>
      <div className="flex flex-col gap-1">
        <Label htmlFor="req-purpose">
          วัตถุประสงค์การเบิก<span className="text-destructive"> *</span>
        </Label>
        <textarea id="req-purpose" className={textareaClass} value={purpose} maxLength={1000} onChange={(e) => setPurpose(e.target.value)} required />
      </div>
      <LinesEditor options={options} rows={rows} setRows={setRows} nextKey={nextKey} checkBalance legend="วัสดุที่ขอเบิก" />
      <p className="text-sm text-muted-foreground">
        ผู้อนุมัติ (เจ้าคณะหรือรองเจ้าคณะของหน่วยเจ้าของคลัง คลังส่วนกลาง = เจ้าหน้าที่ส่วนกลาง) เห็นยอดคงเหลือทุกรายการ และปรับจำนวนที่อนุมัติได้
        เมื่ออนุมัติแล้ว เจ้าหน้าที่พัสดุบันทึกจ่ายของ ระบบจึงตัดสต็อก
      </p>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังส่ง..." : resubmit ? "แก้แล้วส่งใหม่" : "ยื่นใบเบิก"}
        </Button>
      </div>
    </form>
  );
}

/** รับวัสดุเข้าคลัง (จัดซื้อหรือรับบริจาค) */
export function ReceiveForm({
  warehouse,
  options,
  disbursements,
}: {
  warehouse: { id: string; name: string };
  options: ItemOption[];
  disbursements: DisbursementOption[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([emptyRow(0)]);
  const nextKey = useRef(1);
  const [source, setSource] = useState("purchase");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
      data-testid="receive-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const f = new FormData(e.currentTarget);
        if (f.get("received_on_incomplete")) return setError("กรุณากรอกวันที่รับให้ครบ");
        startTransition(async () => {
          const r = await receiveStock({
            warehouse: warehouse.id,
            source,
            receivedOn: String(f.get("received_on") ?? ""),
            documentNo: String(f.get("document_no") ?? ""),
            supplier: String(f.get("supplier") ?? ""),
            disbursement: String(f.get("disbursement") ?? ""),
            note: String(f.get("note") ?? ""),
            lines: toInput(rows, true),
          });
          if (r.ok && r.id) router.push(`/app/inventory/receipts/${r.id}?saved=${encodeURIComponent(r.message ?? "")}`);
          else if (!r.ok) setError(r.error);
        });
      }}
    >
      <p>
        รับเข้า <strong>{warehouse.name}</strong>
      </p>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-1 font-medium">
          ที่มา<span className="text-destructive"> *</span>
        </legend>
        {[
          ["purchase", "จัดซื้อ"],
          ["donation", "รับบริจาค"],
        ].map(([v, l]) => (
          <label key={v} className="flex h-11 items-center gap-2">
            <input type="radio" name="source" value={v} checked={source === v} onChange={() => setSource(v)} className="size-5" />
            {l}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <ThaiDateInput label="วันที่รับ" name="received_on" defaultValue={todayIso()} required />
        <div className="flex flex-col gap-1">
          <Label htmlFor="rc-doc">เลขที่ใบส่งของ / เอกสารอ้างอิง</Label>
          <Input id="rc-doc" name="document_no" maxLength={100} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rc-supplier">{source === "donation" ? "ผู้บริจาค" : "ผู้ขาย / ร้านค้า"}</Label>
          <Input id="rc-supplier" name="supplier" maxLength={200} />
        </div>
        {source === "purchase" ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="rc-disb">อ้างอิงการเบิกจ่ายงบประมาณ (ถ้ามี)</Label>
            <select id="rc-disb" name="disbursement" className={selectClass} defaultValue="">
              <option value="">ไม่อ้างอิง</option>
              {disbursements.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} · {baht(d.amount)} บาท
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">งวดจ่ายของงบหน่วยนี้หรือหน่วยเหนือ (ระบบงบประมาณ)</p>
          </div>
        ) : null}
      </div>
      <LinesEditor options={options} rows={rows} setRows={setRows} nextKey={nextKey} withPrice legend="วัสดุที่รับเข้า" />
      <div className="flex flex-col gap-1">
        <Label htmlFor="rc-note">หมายเหตุ</Label>
        <Input id="rc-note" name="note" maxLength={500} />
      </div>
      <p className="text-sm text-muted-foreground">บันทึกแล้วแก้ไขไม่ได้ (ถ้าผิด ให้ปรับยอดพร้อมเหตุผลที่หน้า Stock Card) แนบใบส่งของได้หลังบันทึก</p>
      <ErrorText>{error}</ErrorText>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "บันทึกรับเข้า"}
        </Button>
      </div>
    </form>
  );
}

/** โอนจากคลังกลางไปคลังย่อย */
export function TransferForm({ from, subs, options }: { from: { id: string; name: string }; subs: { id: string; label: string }[]; options: ItemOption[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([emptyRow(0)]);
  const nextKey = useRef(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
      data-testid="transfer-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const f = new FormData(e.currentTarget);
        if (f.get("sent_on_incomplete")) return setError("กรุณากรอกวันที่โอนให้ครบ");
        startTransition(async () => {
          const r = await sendTransfer({
            from: from.id,
            to: String(f.get("to") ?? ""),
            sentOn: String(f.get("sent_on") ?? ""),
            note: String(f.get("note") ?? ""),
            lines: toInput(rows),
          });
          if (r.ok && r.id) router.push(`/app/inventory/transfers/${r.id}?saved=${encodeURIComponent(r.message ?? "")}`);
          else if (!r.ok) setError(r.error);
        });
      }}
    >
      <p>
        โอนออกจาก <strong>{from.name}</strong>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="tf-to">
            คลังปลายทาง<span className="text-destructive"> *</span>
          </Label>
          <select id="tf-to" name="to" className={selectClass} defaultValue={subs.length === 1 ? subs[0].id : ""} required>
            <option value="">เลือกคลังย่อย</option>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <ThaiDateInput label="วันที่โอน" name="sent_on" defaultValue={todayIso()} required />
      </div>
      <LinesEditor options={options} rows={rows} setRows={setRows} nextKey={nextKey} checkBalance legend="วัสดุที่โอน" />
      <div className="flex flex-col gap-1">
        <Label htmlFor="tf-note">หมายเหตุ</Label>
        <Input id="tf-note" name="note" maxLength={500} />
      </div>
      <p className="text-sm text-muted-foreground">ระบบตัดยอดคลังต้นทางทันที คลังปลายทางได้รับยอดเมื่อกด รับเข้าคลัง (ยกเลิกก่อนปลายทางรับได้ ของคืนต้นทาง)</p>
      <ErrorText>{error}</ErrorText>
      <div>
        <Button type="submit" disabled={pending || subs.length === 0}>
          {pending ? "กำลังบันทึก..." : "บันทึกโอนออก"}
        </Button>
      </div>
    </form>
  );
}
