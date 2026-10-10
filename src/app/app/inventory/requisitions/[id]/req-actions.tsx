"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { qty, todayIso, type RequisitionLine } from "@/lib/inventory";

import { issueRequisition, setRequisitionApproval } from "../../actions";

/** เจ้าหน้าที่พัสดุบันทึกจ่ายของ: จำนวนจ่ายต่อรายการ (ค่าเริ่มต้น = ที่อนุมัติ ไม่เกินยอดคงเหลือ) */
export function IssueForm({ id, lines }: { id: string; lines: RequisitionLine[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.item_id, String(Math.min(Number(l.approved ?? 0), Math.max(0, Number(l.balance ?? 0))))])),
  );
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      data-testid="issue-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setFlash(null);
        const f = new FormData(e.currentTarget);
        if (f.get("issued_on_incomplete")) return setError("กรุณากรอกวันที่จ่ายให้ครบ");
        startTransition(async () => {
          const r = await issueRequisition({
            id,
            issuedOn: String(f.get("issued_on") ?? ""),
            note: String(f.get("issue_note") ?? ""),
            lines: lines.map((l) => ({ item_id: l.item_id, value: values[l.item_id] ?? "" })),
          });
          if (r.ok) {
            setFlash(r.message ?? null);
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {lines.map((l) => (
          <div key={l.item_id} className="flex flex-col gap-1 rounded-lg border p-3">
            <Label htmlFor={`iss-${l.item_id}`}>
              {l.code} {l.name}
            </Label>
            <Input
              id={`iss-${l.item_id}`}
              inputMode="decimal"
              value={values[l.item_id] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [l.item_id]: e.target.value }))}
            />
            <p className="text-sm text-muted-foreground">
              อนุมัติ {qty(l.approved)} {l.unit} · คงเหลือ {qty(l.balance)} {l.unit}
            </p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ThaiDateInput label="วันที่จ่าย" name="issued_on" defaultValue={todayIso()} required />
        <div className="flex flex-col gap-1">
          <Label htmlFor="issue-note">หมายเหตุ</Label>
          <Input id="issue-note" name="issue_note" maxLength={500} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">จ่ายน้อยกว่าที่อนุมัติได้ (ใส่ 0 = ไม่จ่ายรายการนั้น) บันทึกแล้วระบบตัดสต็อกทันทีและปิดใบเบิก</p>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "บันทึกจ่ายของ"}
        </Button>
      </div>
    </form>
  );
}

/** ผู้พิจารณาปรับจำนวนที่อนุมัติรายรายการ (หน้าคำขอกลาง) ก่อนกดอนุมัติ */
export function ApprovalQtyForm({ id, lines }: { id: string; lines: RequisitionLine[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.item_id, String(l.approved ?? l.quantity)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="approval-qty-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setFlash(null);
        startTransition(async () => {
          const r = await setRequisitionApproval(id, lines.map((l) => ({ item_id: l.item_id, value: values[l.item_id] ?? "" })));
          if (r.ok) {
            setFlash(r.message ?? null);
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      <p className="text-muted-foreground">ไม่ปรับ = อนุมัติเท่าที่ขอทุกรายการ ปรับแล้วกด บันทึกจำนวนที่อนุมัติ ก่อนกดอนุมัติด้านล่าง</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {lines.map((l) => (
          <div key={l.item_id} className="flex flex-col gap-1 rounded-lg border p-3">
            <Label htmlFor={`apr-${l.item_id}`}>
              {l.code} {l.name}
            </Label>
            <Input
              id={`apr-${l.item_id}`}
              inputMode="decimal"
              value={values[l.item_id] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [l.item_id]: e.target.value }))}
            />
            <p className="text-sm text-muted-foreground">
              ขอ {qty(l.quantity)} {l.unit} · คงเหลือในคลัง {qty(l.balance)} {l.unit}
            </p>
          </div>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "บันทึกจำนวนที่อนุมัติ"}
        </Button>
      </div>
    </form>
  );
}
