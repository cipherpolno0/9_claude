"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { baht } from "@/lib/budget";

import { adjustDisbursement, closeUse, recordDisbursement } from "../actions";

/** บันทึกการเบิกจ่ายหนึ่งงวด (ยอดรวมทุกงวดต้องไม่เกินยอดที่อนุมัติ ฐานข้อมูลตรวจซ้ำ) */
export function DisbursementForm({
  useId,
  outstanding,
  today,
  assetRef,
}: {
  useId: string;
  outstanding: number;
  today: string;
  /** แสดงช่องอ้างอิงรายการรับเข้าพัสดุ (หมวดค่าวัสดุ ค่าครุภัณฑ์) */
  assetRef: boolean;
}) {
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      key={formKey}
      className="flex flex-col gap-4"
      data-testid="disbursement-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        setFlash(null);
        if (f.get("paid_on_incomplete") === "1" || !f.get("paid_on")) {
          setError("กรุณากรอกวันที่จ่ายให้ครบ");
          return;
        }
        startTransition(async () => {
          const r = await recordDisbursement({
            use: useId,
            paidOn: String(f.get("paid_on") ?? ""),
            payee: String(f.get("payee") ?? ""),
            amount: String(f.get("amount") ?? ""),
            voucher: String(f.get("voucher") ?? ""),
            note: String(f.get("note") ?? ""),
            assetRef: String(f.get("asset_ref") ?? ""),
          });
          if (r.ok) {
            setFlash(r.message ?? null);
            setFormKey((k) => k + 1);
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ThaiDateInput label="วันที่จ่าย" name="paid_on" defaultValue={today} required />
        <div className="flex flex-col gap-1">
          <Label htmlFor="pay-amount">
            จำนวนเงิน (บาท)<span className="text-destructive"> *</span>
          </Label>
          <Input id="pay-amount" name="amount" inputMode="decimal" required />
          <p className="text-sm text-muted-foreground">เบิกได้อีกไม่เกิน {baht(outstanding)} บาท</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pay-payee">
            ผู้รับเงิน<span className="text-destructive"> *</span>
          </Label>
          <Input id="pay-payee" name="payee" maxLength={200} required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pay-voucher">เลขที่ใบสำคัญ</Label>
          <Input id="pay-voucher" name="voucher" maxLength={60} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="pay-note">หมายเหตุ</Label>
          <Input id="pay-note" name="note" maxLength={500} />
        </div>
        {assetRef ? (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="pay-asset">อ้างอิงรายการรับเข้าพัสดุ (ระบบพัสดุ-ครุภัณฑ์)</Label>
            <Input id="pay-asset" name="asset_ref" maxLength={40} placeholder="เว้นว่างได้" />
            <p className="text-sm text-muted-foreground">เว้นว่างได้ การผูกวัสดุที่ซื้อกับงวดจ่ายนี้ ให้เจ้าหน้าที่พัสดุเลือกงวดจ่ายตอนบันทึกรับเข้าที่เมนู พัสดุ-ครุภัณฑ์ &gt; รับเข้า</p>
          </div>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">บันทึกแล้วแก้ไขหรือลบไม่ได้ ถ้าผิดให้ทำรายการปรับปรุงพร้อมเหตุผล แนบใบเสร็จได้ที่แถวของงวดนั้น</p>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "บันทึกการเบิกจ่าย"}
        </Button>
      </div>
    </form>
  );
}

/** รายการปรับปรุงของงวดที่จ่ายแล้ว (เพิ่มหรือลดยอด ต้องมีเหตุผล) */
export function AdjustButton({ id, installment, net }: { id: string; installment: number; net: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [decrease, setDecrease] = useState(true);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        ปรับปรุง
      </Button>
    );
  }
  return (
    <div className="flex min-w-64 flex-col gap-2" data-testid="adjust-form">
      <p className="text-sm font-semibold">ปรับปรุงงวดที่ {installment} (ยอดสุทธิ {baht(net)} บาท)</p>
      <div className="flex gap-3 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" name={`dir-${id}`} checked={decrease} onChange={() => setDecrease(true)} />
          ลดยอด
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name={`dir-${id}`} checked={!decrease} onChange={() => setDecrease(false)} />
          เพิ่มยอด
        </label>
      </div>
      <Label htmlFor={`adj-amount-${id}`} className="text-sm">
        จำนวนเงิน (บาท)
      </Label>
      <Input id={`adj-amount-${id}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Label htmlFor={`adj-reason-${id}`} className="text-sm">
        เหตุผล
      </Label>
      <Input id={`adj-reason-${id}`} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending || reason.trim().length < 3 || !amount.trim()}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await adjustDisbursement(id, amount, decrease, reason, "");
              if (r.ok) {
                setOpen(false);
                router.refresh();
              } else setError(r.error);
            })
          }
        >
          บันทึกรายการปรับปรุง
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          ปิด
        </Button>
      </div>
    </div>
  );
}

/** คืนเงินเหลือจ่าย: ปลดยอดผูกพันที่ยังไม่เบิกกลับเข้ารายการ แล้วปิดคำขอ */
export function CloseUseButton({ id, outstanding }: { id: string; outstanding: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <InfoText>{flash}</InfoText>
        <div>
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            คืนเงินเหลือจ่ายและปิดคำขอ
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="close-use">
      <p>
        ระบบจะคืนยอด <strong className="tabular-nums">{baht(outstanding)}</strong> บาท กลับเข้ารายการงบประมาณ และปิดคำขอนี้ หลังปิดแล้วเบิกจ่ายหรือปรับปรุงเพิ่มไม่ได้
      </p>
      <Label htmlFor="close-reason">หมายเหตุ (ถ้ามี)</Label>
      <Input id="close-reason" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await closeUse(id, reason);
              if (r.ok) {
                setFlash(r.message ?? null);
                setOpen(false);
                router.refresh();
              } else setError(r.error);
            })
          }
        >
          ยืนยันคืนเงินและปิดคำขอ
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}
