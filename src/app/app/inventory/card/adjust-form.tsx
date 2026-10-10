"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ErrorText, InfoText } from "@/components/form";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayIso } from "@/lib/inventory";

import { adjustStock } from "../actions";

/** ปรับยอด: บวก = เพิ่ม ลบ = ลด ต้องมีเหตุผล (เช่น นับแล้วไม่ตรง ชำรุด สูญหาย บันทึกรับเข้าผิด) */
export function AdjustForm({ warehouse, item, unit }: { warehouse: string; item: string; unit: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="adjust-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setFlash(null);
        const form = e.currentTarget;
        const f = new FormData(form);
        if (f.get("moved_on_incomplete")) return setError("กรุณากรอกวันที่ให้ครบ");
        startTransition(async () => {
          const r = await adjustStock({
            warehouse,
            item,
            quantity: String(f.get("quantity") ?? ""),
            reason: String(f.get("reason") ?? ""),
            movedOn: String(f.get("moved_on") ?? ""),
          });
          if (r.ok) {
            setFlash(r.message ?? null);
            form.reset();
            router.refresh();
          } else setError(r.error);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="adj-qty">จำนวน ({unit})</Label>
          <Input id="adj-qty" name="quantity" inputMode="decimal" placeholder="เช่น -2 หรือ 5" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="adj-reason">เหตุผล</Label>
          <Input id="adj-reason" name="reason" maxLength={500} required />
        </div>
      </div>
      <ThaiDateInput label="วันที่" name="moved_on" defaultValue={todayIso()} required className="sm:max-w-md" />
      <ErrorText>{error}</ErrorText>
      <InfoText>{flash}</InfoText>
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "บันทึกการปรับยอด"}
        </Button>
      </div>
    </form>
  );
}
