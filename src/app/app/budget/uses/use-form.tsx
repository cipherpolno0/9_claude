"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ErrorText, InfoText, selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { baht, lineAmount, sumMoney } from "@/lib/budget";

import { resubmitUse, submitUse, type UseLineInput } from "./actions";

export type UseItemOption = { id: string; path: string; free: number };

type Row = UseLineInput & { key: number };

const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const emptyLine = (key: number): Row => ({ key, description: "", quantity: "1", unit: "", unit_price: "" });

/** ยื่นคำขอใช้งบ หรือแก้แล้วส่งใหม่เมื่อถูกส่งกลับ: จำนวนเงินรวมคิดจากรายละเอียดค่าใช้จ่าย */
export function UseForm({
  items,
  unitId,
  initialItem,
  query,
  resubmit,
}: {
  items: UseItemOption[];
  unitId: string;
  initialItem: string;
  query: string;
  resubmit?: { id: string; item: string; purpose: string; lines: UseLineInput[]; maxAmount: number };
}) {
  const router = useRouter();
  const [item, setItem] = useState(resubmit?.item ?? initialItem);
  const [purpose, setPurpose] = useState(resubmit?.purpose ?? "");
  const [rows, setRows] = useState<Row[]>(
    resubmit?.lines.length ? resubmit.lines.map((l, i) => ({ ...l, quantity: String(l.quantity), unit_price: String(l.unit_price), key: i })) : [emptyLine(0)],
  );
  const nextKey = useRef(rows.length);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chosen = items.find((i) => i.id === item);
  const amounts = rows.map((r) => lineAmount(r.quantity, r.unit_price));
  const total = sumMoney(amounts.map((a) => a ?? 0));
  const limit = resubmit ? Math.min(resubmit.maxAmount, chosen?.free ?? resubmit.maxAmount) : chosen?.free;
  const over = limit !== undefined && total > limit;

  const update = (key: number, patch: Partial<UseLineInput>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="use-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setFlash(null);
        const lines = rows.map(({ description, quantity, unit, unit_price }) => ({ description, quantity, unit, unit_price }));
        startTransition(async () => {
          if (resubmit) {
            const r = await resubmitUse(resubmit.id, purpose, lines);
            if (r.ok) {
              setFlash(r.message ?? null);
              router.refresh();
            } else setError(r.error);
            return;
          }
          const r = await submitUse({ item, unit: unitId, purpose, lines });
          if (r.ok && r.id) router.push(`/app/budget/uses/${r.id}?${query}&saved=${encodeURIComponent(r.message ?? "")}`);
          else if (!r.ok) setError(r.error);
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="use-item">
          รายการงบประมาณ (หมวดรายจ่าย)<span className="text-destructive"> *</span>
        </Label>
        <select id="use-item" className={selectClass} value={item} onChange={(e) => setItem(e.target.value)} disabled={Boolean(resubmit)} required>
          <option value="">เลือกรายการ</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.path} (คงเหลือ {baht(i.free)})
            </option>
          ))}
        </select>
        {chosen ? <p className="text-sm text-muted-foreground">คงเหลือที่ขอใช้ได้ {baht(chosen.free)} บาท</p> : null}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="use-purpose">
          วัตถุประสงค์<span className="text-destructive"> *</span>
        </Label>
        <textarea id="use-purpose" className={textareaClass} value={purpose} maxLength={1000} onChange={(e) => setPurpose(e.target.value)} required />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">
          รายละเอียดค่าใช้จ่าย<span className="text-destructive"> *</span>
        </legend>
        {rows.map((r, i) => (
          <div key={r.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end" data-testid="use-line">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`l${r.key}-desc`}>รายการที่ {i + 1}</Label>
              <Input id={`l${r.key}-desc`} value={r.description} maxLength={200} onChange={(e) => update(r.key, { description: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`l${r.key}-qty`}>จำนวน</Label>
              <Input id={`l${r.key}-qty`} inputMode="decimal" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`l${r.key}-unit`}>หน่วยนับ</Label>
              <Input id={`l${r.key}-unit`} value={r.unit} maxLength={30} onChange={(e) => update(r.key, { unit: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`l${r.key}-price`}>ราคาต่อหน่วย (บาท)</Label>
              <Input id={`l${r.key}-price`} inputMode="decimal" value={r.unit_price} onChange={(e) => update(r.key, { unit_price: e.target.value })} />
            </div>
            <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-end">
              <span className="tabular-nums" data-testid="line-amount">
                {amounts[i] === null ? "-" : baht(amounts[i])}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows.length === 1}
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              >
                <Trash2 aria-hidden />
                <span className="sr-only">ลบรายการที่ {i + 1}</span>
              </Button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={rows.length >= 50}
            onClick={() => setRows((rs) => [...rs, emptyLine(nextKey.current++)])}
          >
            <Plus aria-hidden />
            เพิ่มรายการ
          </Button>
          <p className="text-lg font-semibold" aria-live="polite">
            รวม <span data-testid="use-total" className="tabular-nums">{baht(total)}</span> บาท
          </p>
        </div>
        {over ? (
          <p className="text-sm text-destructive">
            ยอดรวมเกิน{resubmit ? "คำขอเดิมหรือ" : ""}ยอดคงเหลือ ({baht(limit)} บาท)
          </p>
        ) : null}
      </fieldset>

      <p className="text-sm text-muted-foreground">
        เอกสารประกอบ (เช่น ใบเสนอราคา) แนบได้ที่หน้าคำขอหลังยื่น ระบบส่งให้เจ้าคณะเห็นชอบทีละชั้นจนถึงชั้นที่มีวงเงินอนุมัติพอ
        เมื่ออนุมัติแล้วระบบกันเงิน (ผูกพัน) ทันที
      </p>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || !item}>
          {pending ? "กำลังส่ง..." : resubmit ? "แก้แล้วส่งใหม่" : "ยื่นคำขอใช้งบ"}
        </Button>
      </div>
    </form>
  );
}
