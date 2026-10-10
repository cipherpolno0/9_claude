"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText, selectClass } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { baht } from "@/lib/budget";

import { resubmitTransfer, submitTransfer } from "../actions";

export type TransferItemOption = { id: string; path: string; amount: number; free: number };

const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** ยื่นคำขอโอน (เลือกรายการต้นทาง ปลายทาง จำนวน เหตุผล) หรือแก้แล้วส่งใหม่เมื่อถูกส่งกลับ */
export function TransferForm({
  items,
  initialFrom,
  query,
  resubmit,
}: {
  items: TransferItemOption[];
  initialFrom: string;
  query: string;
  resubmit?: { id: string; from: string; to: string; amount: string; reason: string };
}) {
  const router = useRouter();
  const [from, setFrom] = useState(resubmit?.from ?? initialFrom);
  const [to, setTo] = useState(resubmit?.to ?? "");
  const [amount, setAmount] = useState(resubmit?.amount ?? "");
  const [reason, setReason] = useState(resubmit?.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const source = items.find((i) => i.id === from);

  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="transfer-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          if (resubmit) {
            const r = await resubmitTransfer(resubmit.id, amount, reason);
            if (r.ok) {
              setFlash(r.message ?? null);
              router.refresh();
            } else setError(r.error);
            return;
          }
          const r = await submitTransfer({ from, to, amount, reason });
          if (r.ok && r.id) router.push(`/app/budget/transfers/${r.id}?${query}&saved=${encodeURIComponent(r.message ?? "")}`);
          else if (!r.ok) setError(r.error);
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="from">
          โอนจากรายการ<span className="text-destructive"> *</span>
        </Label>
        <select id="from" className={selectClass} value={from} onChange={(e) => setFrom(e.target.value)} disabled={Boolean(resubmit)} required>
          <option value="">เลือกรายการต้นทาง</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.path} (คงเหลือโอนได้ {baht(i.free)})
            </option>
          ))}
        </select>
        {source ? (
          <p className="text-sm text-muted-foreground">
            วงเงิน {baht(source.amount)} บาท · ยังไม่จัดสรร {baht(source.free)} บาท (โอนได้ไม่เกินยอดนี้)
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="to">
          ไปยังรายการ<span className="text-destructive"> *</span>
        </Label>
        <select id="to" className={selectClass} value={to} onChange={(e) => setTo(e.target.value)} disabled={Boolean(resubmit)} required>
          <option value="">เลือกรายการปลายทาง</option>
          {items
            .filter((i) => i.id !== from)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.path} (วงเงิน {baht(i.amount)})
              </option>
            ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="transfer-amount">
          จำนวนเงินที่โอน (บาท)<span className="text-destructive"> *</span>
        </Label>
        <Input id="transfer-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="transfer-reason">
          เหตุผลการโอน<span className="text-destructive"> *</span>
        </Label>
        <textarea id="transfer-reason" className={textareaClass} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} required />
      </div>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังส่ง..." : resubmit ? "แก้แล้วส่งใหม่" : "ยื่นคำขอโอน"}
        </Button>
      </div>
    </form>
  );
}
